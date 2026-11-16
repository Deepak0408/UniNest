import {createContext,useContext,useEffect,useState} from 'react'
import {Navigate,useLocation} from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as updateAuthProfile,
  sendEmailVerification
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  limit,
  getDocs
} from 'firebase/firestore'
import {auth,db,isFirebaseConfigured} from './lib/firebase.js'

const Ctx=createContext(null)
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}}
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v))
const norm=e=>e.trim().toLowerCase()
const DEFAULT_ADMIN_EMAILS=['admin@uninest.example','admin@uninest.edu','kumar.aditya30122006@gmail.com','admin']
const DEFAULT_VERIFIED_EMAILS=['kumar.aditya30122006@gmail.com']

export const getAdminEmails=()=>{
  try{
    const stored=read('uninest.adminEmails',[])
    return [...new Set([...DEFAULT_ADMIN_EMAILS,...stored.map(norm)])]
  }catch{
    return DEFAULT_ADMIN_EMAILS
  }
}

export const getManuallyVerifiedEmails=()=>{
  try{
    const stored=read('uninest.verifiedEmails',[])
    return [...new Set([...DEFAULT_VERIFIED_EMAILS,...stored.map(norm)])]
  }catch{
    return DEFAULT_VERIFIED_EMAILS
  }
}

export const getSuspendedUsers=()=>{
  try{
    const stored=read('uninest.suspendedUsers',{})
    const now=Date.now()
    let changed=false
    const active={}
    for(const [key,val] of Object.entries(stored)){
      if(val.expiresAt && now>val.expiresAt){
        changed=true
      }else{
        active[key]=val
      }
    }
    if(changed)write('uninest.suspendedUsers',active)
    return active
  }catch{
    return {}
  }
}

export const isSuspendedUser=identifier=>{
  if(!identifier)return null
  const key=norm(identifier)
  const map=getSuspendedUsers()
  return map[key]||null
}

export const getAuditLogs=()=>{
  try{return read('uninest.adminAuditLogs',[])}catch{return []}
}

export const appendAuditLog=log=>{
  try{
    const current=read('uninest.adminAuditLogs',[])
    const entry={id:Math.random().toString(36).slice(2,9),t:Date.now(),...log}
    write('uninest.adminAuditLogs',[entry,...current].slice(0,150))
    return entry
  }catch{
    return null
  }
}

export const isStudentEmail=email=>{
  const e=norm(email||'')
  return e.endsWith('@sudoon.ac.in')||e.endsWith('.edu')||e.endsWith('.ac.in')
}

export const isVerifiedEmail=(email,authUser=null)=>{
  if(!email)return false
  const e=norm(email)
  if(authUser?.emailVerified)return true
  if(getManuallyVerifiedEmails().includes(e))return true
  if(getAdminEmails().includes(e))return true
  if(isStudentEmail(e))return true
  return false
}

export const idFromEmail=email=>{
  const base=norm(email).split('@')[0].replace(/[^a-z0-9._]/g,'').slice(0,20)||'student'
  const taken=new Set(read('uninest.users',[]).map(u=>u.uid));let id=base,n=1
  while(taken.has(id))id=base+(++n)
  return id
}

const profileFromUser=(authUser,local={},remote={})=>{
  const meta={...local,...remote}
  return {
    ...local,
    ...remote,
    authId:authUser?.uid,
    uid:meta.uid||local.uid||idFromEmail(authUser?.email||''),
    email:authUser?.email||local.email||'',
    name:meta.name||local.name||authUser?.displayName||'',
    college:meta.college||local.college||'',
    year:meta.year||local.year||'',
    stream:meta.stream||local.stream||'',
    interests:meta.interests||local.interests||[],
    avatar:meta.avatar||local.avatar||authUser?.photoURL||'',
    phone:meta.phone||local.phone||authUser?.phoneNumber||'',
    bio:meta.bio||local.bio||'',
    skills:meta.skills||local.skills||'',
    verified:isVerifiedEmail(authUser?.email,authUser)
  }
}

const saveLocalProfile=profile=>{
  try{
    const users=read('uninest.users',[])
    write('uninest.users',[...users.filter(item=>item.uid!==profile.uid),profile])
  }catch(e){
    console.warn('LocalStorage save profile skipped to prevent quota error:',e)
  }
}

const saveFirestoreProfile=async profile=>{
  if(!db||!profile.authId)return
  await setDoc(doc(db,'profiles',profile.authId),{
    id:profile.authId,
    uid:profile.uid,
    email:profile.email,
    name:profile.name,
    college:profile.college,
    year:profile.year,
    stream:profile.stream,
    interests:profile.interests||[],
    avatar:profile.avatar||'',
    phone:profile.phone||'',
    bio:profile.bio||'',
    skills:profile.skills||'',
    updated_at:new Date().toISOString()
  },{merge:true})
}

export function AuthProvider({children}){
  const [user,setUser]=useState(null)
  const [loading,setLoading]=useState(true)
  const [adminMode,setAdminModeState]=useState(()=>read('uninest.adminMode',false))
  const [adminEmailsList,setAdminEmailsList]=useState(getAdminEmails)
  const [bannedList,setBannedList]=useState(()=>read('uninest.bannedEmails',[]))
  const [verifiedList,setVerifiedList]=useState(getManuallyVerifiedEmails)
  const [suspendedUsersMap,setSuspendedUsersMap]=useState(getSuspendedUsers)
  const [auditLogsList,setAuditLogsList]=useState(getAuditLogs)
  const [maintenanceMode,setMaintenanceModeState]=useState(()=>read('uninest.maintenanceMode',false))
  const [allowRegistrations,setAllowRegistrationsState]=useState(()=>read('uninest.allowRegistrations',true))

  const isBanned=email=>read('uninest.bannedEmails',[]).includes(norm(email))

  const logAdminAction=(action,target,details)=>{
    appendAuditLog({action,target,details,admin:user?.name||user?.email||'Admin'})
    setAuditLogsList(getAuditLogs())
  }

  const setMaintenanceMode=val=>{
    write('uninest.maintenanceMode',!!val)
    setMaintenanceModeState(!!val)
    logAdminAction('MAINTENANCE_TOGGLE','SYSTEM',`Maintenance mode set to ${!!val?'ENABLED':'DISABLED'}`)
  }

  const setAllowRegistrations=val=>{
    write('uninest.allowRegistrations',!!val)
    setAllowRegistrationsState(!!val)
    logAdminAction('REGISTRATIONS_TOGGLE','SYSTEM',`New registrations set to ${!!val?'OPEN':'PAUSED'}`)
  }

  const suspendUser=(identifier,{days=7,reason='Community guidelines violation'}={})=>{
    const key=norm(identifier)
    const current=getSuspendedUsers()
    const d=Number(days)
    const expiresAt=d>0?Date.now()+(d*86400000):null
    const record={
      id:key,
      reason,
      days:d,
      suspendedAt:Date.now(),
      expiresAt,
      suspendedBy:user?.name||user?.email||'Admin'
    }
    const updated={...current,[key]:record}
    write('uninest.suspendedUsers',updated)
    setSuspendedUsersMap(updated)
    logAdminAction('SUSPEND_USER',key,`Suspended for ${d>0?d+' days':'Indefinite'}. Reason: ${reason}`)
    return record
  }

  const unsuspendUser=identifier=>{
    const key=norm(identifier)
    const current=getSuspendedUsers()
    const {[key]:removed,...rest}=current
    write('uninest.suspendedUsers',rest)
    setSuspendedUsersMap(rest)
    logAdminAction('UNSUSPEND_USER',key,'Suspension lifted by administrator')
  }

  const setAdminMode=val=>{
    write('uninest.adminMode',!!val)
    setAdminModeState(!!val)
  }

  const addAdminEmail=email=>{
    const normalized=norm(email)
    const list=[...new Set([...read('uninest.adminEmails',[]),normalized])]
    write('uninest.adminEmails',list)
    setAdminEmailsList(getAdminEmails())
    logAdminAction('ADD_ADMIN',normalized,'Granted administrator privileges')
  }

  const removeAdminEmail=email=>{
    const normalized=norm(email)
    const list=read('uninest.adminEmails',[]).filter(e=>norm(e)!==normalized)
    write('uninest.adminEmails',list)
    setAdminEmailsList(getAdminEmails())
    logAdminAction('REMOVE_ADMIN',normalized,'Revoked administrator privileges')
  }

  const unbanEmail=email=>{
    const normalized=norm(email)
    const list=read('uninest.bannedEmails',[]).filter(e=>norm(e)!==normalized)
    write('uninest.bannedEmails',list)
    setBannedList(list)
    logAdminAction('UNBAN_USER',normalized,'Ban lifted by administrator')
  }

  const banEmail=(email,reason='')=>{
    const normalized=norm(email)
    const list=[...new Set([...read('uninest.bannedEmails',[]),normalized])]
    write('uninest.bannedEmails',list)
    setBannedList(list)
    if(reason){
      const records=read('uninest.bannedRecords',{})
      records[normalized]={reason,bannedAt:Date.now(),bannedBy:user?.email||'Admin'}
      write('uninest.bannedRecords',records)
    }
    logAdminAction('BAN_USER',normalized,`Permanently banned. Reason: ${reason||'Policy violation'}`)
  }

  const verifyUser=(email,verified=true)=>{
    const normalized=norm(email)
    const current=read('uninest.verifiedEmails',[])
    const updated=verified?[...new Set([...current,normalized])]:current.filter(e=>norm(e)!==normalized)
    write('uninest.verifiedEmails',updated)
    setVerifiedList(getManuallyVerifiedEmails())
    const users=read('uninest.users',[])
    const nextUsers=users.map(u=>norm(u.email)===normalized?{...u,verified}:u)
    write('uninest.users',nextUsers)
    if(user&&norm(user.email)===normalized){
      setUser(prev=>({...prev,verified}))
    }
    logAdminAction(verified?'VERIFY_STUDENT':'UNVERIFY_STUDENT',normalized,verified?'Granted verified student badge':'Revoked verified badge')
  }

  useEffect(()=>{
    if(!auth){setLoading(false);return}
    let mounted=true
    const unsubscribe=onAuthStateChanged(auth,async firebaseUser=>{
      if(!mounted)return
      if(firebaseUser){
        let remote={}
        if(db){
          try{
            const snap=await getDoc(doc(db,'profiles',firebaseUser.uid))
            if(snap.exists())remote=snap.data()
          }catch(error){
            console.warn('Could not load Firestore profile:',error)
          }
        }
        const local=read('uninest.users',[]).find(x=>x.authId===firebaseUser.uid||x.email===firebaseUser.email)||{}
        const profile=profileFromUser(firebaseUser,local,remote)
        saveLocalProfile(profile)
        if(mounted)setUser(profile)
      }else{
        if(mounted)setUser(null)
      }
      if(mounted)setLoading(false)
    })
    return()=>{mounted=false;unsubscribe()}
  },[])

  const createAccount=async({email,name,college,year,stream,password,interests=[],avatar='',phone=''})=>{
    if(!allowRegistrations)throw new Error('New student registrations are temporarily paused by campus administration.')
    if(!auth)throw new Error('Firebase is not configured. Add VITE_FIREBASE_API_KEY and other Firebase variables to .env.')
    if(isBanned(email))throw new Error('This email address has been banned from UniNest.')
    const suspended=isSuspendedUser(email)
    if(suspended)throw new Error(`This email has been suspended until ${suspended.expiresAt?new Date(suspended.expiresAt).toLocaleDateString():'further notice'}. Reason: ${suspended.reason}`)
    if(password.length<8)throw new Error('Use at least 8 characters for your password.')
    const uid=idFromEmail(email)
    const userCredential=await createUserWithEmailAndPassword(auth,norm(email),password)
    const firebaseUser=userCredential.user
    if(!firebaseUser)throw new Error('Firebase did not return a user after signup. Please try again.')

    try{
      await updateAuthProfile(firebaseUser,{
        displayName:name.trim(),
        photoURL:avatar||undefined
      })
    }catch{}

    let requiresConfirmation=false
    try{
      await sendEmailVerification(firebaseUser)
      requiresConfirmation=true
    }catch{}

    const profile={
      authId:firebaseUser.uid,
      uid,
      email:norm(email),
      name:name.trim(),
      college:college.trim(),
      year,
      stream,
      interests,
      avatar,
      phone:phone.trim(),
      bio:'',
      skills:'',
      verified:isVerifiedEmail(email,firebaseUser)
    }

    saveLocalProfile(profile)
    try{
      await saveFirestoreProfile(profile)
    }catch(error){
      console.warn('Could not sync profile to Firestore:',error)
    }
    setUser(profile)
    return {requiresConfirmation,email:norm(email)}
  }

  const resendConfirmation=async email=>{
    if(!auth)throw new Error('Firebase is not configured.')
    if(auth.currentUser){
      await sendEmailVerification(auth.currentUser)
    }else{
      throw new Error('Please log in first to resend your verification email.')
    }
  }

  const login=async(idOrEmail,password)=>{
    const key=norm(idOrEmail).replace(/^@/,'')

    // Built-in Admin Account & Demo Fallback
    if(key==='admin'||key==='admin@uninest.example'||key==='admin@uninest.edu'||key==='kumar.aditya30122006@gmail.com'){
      if(password==='admin123'||password==='uninest'||password==='admin'||!auth){
        const adminProfile={
          authId:'admin-master-id',
          uid:'admin',
          email:'admin@uninest.example',
          name:'Campus Administrator',
          college:'Sudoon University',
          year:'4',
          stream:'BTech CSE Core',
          interests:['Hackathons','AI/ML','Web dev','Robotics'],
          avatar:'',
          role:'admin',
          verified:true
        }
        saveLocalProfile(adminProfile)
        setUser(adminProfile)
        return
      }
    }

    if(!auth)throw new Error('Firebase is not configured. Add VITE_FIREBASE_API_KEY and other Firebase variables to .env.')
    const local=read('uninest.users',[]).find(x=>x.uid===key)
    let email=local?.email||key

    if(!email.includes('@')&&db){
      try{
        const q=query(collection(db,'profiles'),where('uid','==',key),limit(1))
        const snap=await getDocs(q)
        if(!snap.empty){
          email=snap.docs[0].data().email||email
        }
      }catch{}
    }

    if(isBanned(email))throw new Error('This email address has been banned from UniNest.')
    const suspended=isSuspendedUser(email)||isSuspendedUser(key)
    if(suspended)throw new Error(`This ID/email has been suspended until ${suspended.expiresAt?new Date(suspended.expiresAt).toLocaleDateString():'further notice'}. Reason: ${suspended.reason}`)
    const userCredential=await signInWithEmailAndPassword(auth,email,password)
    const firebaseUser=userCredential.user
    let remote={}
    if(db){
      try{
        const snap=await getDoc(doc(db,'profiles',firebaseUser.uid))
        if(snap.exists())remote=snap.data()
      }catch{}
    }
    const profile=profileFromUser(firebaseUser,local,remote)
    saveLocalProfile(profile)
    try{
      await saveFirestoreProfile(profile)
    }catch{}
    setUser(profile)
  }

  const updateProfile=async patch=>{
    if(!user)return
    if(!auth)throw new Error('Firebase is not configured.')
    const updated={...user,...patch}
    saveLocalProfile(updated)
    setUser(updated)
    const errors=[]
    if(auth.currentUser){
      const updates={}
      if(patch.name)updates.displayName=patch.name.trim()
      if(patch.avatar)updates.photoURL=patch.avatar
      if(Object.keys(updates).length>0){
        try{
          await updateAuthProfile(auth.currentUser,updates)
        }catch(error){
          console.warn('Auth profile update:',error)
        }
      }
    }
    try{
      await saveFirestoreProfile(updated)
    }catch(error){
      errors.push(`Firestore profile: ${error.message||'failed'}`)
    }
    if(errors.length)throw new Error(`Profile saved on this device, but could not sync with Firebase (${errors.join('; ')}).`)
  }

  const logout=async()=>{
    if(auth)await signOut(auth)
    setUser(null)
  }

  const checkIsAdmin=Boolean(
    user && (
      adminEmailsList.includes(norm(user.email||'')) ||
      adminEmailsList.includes(norm(user.uid||'')) ||
      user.role==='admin'
    )
  )

  const api={
    user,
    isAdmin:checkIsAdmin,
    adminMode,
    setAdminMode,
    adminEmails:adminEmailsList,
    addAdminEmail,
    removeAdminEmail,
    bannedEmails:bannedList,
    banEmail,
    unbanEmail,
    suspendedUsers:suspendedUsersMap,
    suspendUser,
    unsuspendUser,
    isSuspended:isSuspendedUser,
    auditLogs:auditLogsList,
    maintenanceMode,
    setMaintenanceMode,
    allowRegistrations,
    setAllowRegistrations,
    verifyUser,
    verifiedEmails:verifiedList,
    isVerifiedStudent:!!user&&isVerifiedEmail(user.email,user),
    previewId:idFromEmail,
    createAccount,
    resendConfirmation,
    login,
    updateProfile,
    logout,
    loading
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export const useAuth=()=>useContext(Ctx)

export function RequireAuth({children}){
  const {user,loading}=useAuth(),loc=useLocation()
  if(loading)return <p className="panel p-6">Loading your session…</p>
  return user?children:<Navigate to="/login" replace state={{from:loc.pathname}}/>
}

export function RequireAdmin({children}){
  const {user,loading,isAdmin}=useAuth(),loc=useLocation()
  if(loading)return <p className="panel p-6">Loading your session…</p>
  if(!user)return <Navigate to="/login" replace state={{from:loc.pathname}}/>
  if(!isAdmin)return <Navigate to="/feed" replace/>
  return children
}

export function GuestOnly({children}){
  const {user,loading}=useAuth()
  return loading?<p className="panel p-6">Loading your session…</p>:user?<Navigate to="/feed" replace/>:children
}
