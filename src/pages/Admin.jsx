import {useState,useMemo} from 'react'
import {Link,Navigate} from 'react-router-dom'
import {useAuth} from '../auth.jsx'
import {useSocial} from '../social.jsx'
import {Avatar,VerifiedBadge,ago} from '../components/ui.jsx'
import {Icon} from '../components/Layout.jsx'
import {isFirebaseConfigured} from '../lib/firebase.js'
import {STREAMS} from '../data.js'

export default function Admin(){
  const auth=useAuth()
  const {
    user,
    isAdmin,
    adminEmails,
    addAdminEmail,
    removeAdminEmail,
    bannedEmails,
    banEmail,
    unbanEmail,
    suspendedUsers,
    suspendUser,
    unsuspendUser,
    auditLogs,
    maintenanceMode,
    setMaintenanceMode,
    allowRegistrations,
    setAllowRegistrations,
    verifyUser,
    verifiedEmails
  }=auth

  const social=useSocial()
  const {
    people,
    posts,
    commentReports,
    lostFound,
    clubEvents,
    teams,
    announcements,
    adminDeletePost,
    adminTogglePinPost,
    adminDeleteComment,
    adminDismissReport,
    adminClearAllReports,
    adminDeleteLostFound,
    adminAddAnnouncement,
    adminDeleteAnnouncement
  }=social

  // Primary Tab State
  const [activeTab,setActiveTab]=useState('analytics')
  const [toast,setToast]=useState('')

  // Search & Filter States
  const [userSearch,setUserSearch]=useState('')
  const [userFilter,setUserFilter]=useState('all') // all, active, verified, unverified, suspended, banned, admins
  const [userStreamFilter,setUserStreamFilter]=useState('all')
  const [postSearch,setPostSearch]=useState('')
  const [postTopic,setPostTopic]=useState('all')
  const [lostSearch,setLostSearch]=useState('')
  const [lostType,setLostType]=useState('all')

  // Modals & Action Dialogs
  const [suspendModalUser,setSuspendModalUser]=useState(null) // student object
  const [suspendDays,setSuspendDays]=useState(7)
  const [suspendReason,setSuspendReason]=useState('Harassment or inappropriate behavior in comments')

  const [banModalUser,setBanModalUser]=useState(null)
  const [banReasonInput,setBanReasonInput]=useState('Violation of campus safety guidelines')

  // Announcement Form
  const [newNotice,setNewNotice]=useState({title:'',badge:'Official Alert',content:'',link:''})
  const [noticeError,setNoticeError]=useState('')

  // Security Form
  const [newAdminEmail,setNewAdminEmail]=useState('')
  const [directBanEmail,setDirectBanEmail]=useState('')
  const [directBanReason,setDirectBanReason]=useState('')

  const notify=msg=>{
    setToast(msg)
    setTimeout(()=>setToast(''),4000)
  }

  // Strict Admin Gate: non-admins are immediately bounced to /feed
  if(!isAdmin){
    return <Navigate to="/feed" replace/>
  }

  // -------------------------------------------------------------------------
  // METRICS & ANALYTICS COMPUTATIONS
  // -------------------------------------------------------------------------
  const metrics=useMemo(()=>{
    const totalUsers=people.length
    const verifiedCount=people.filter(p=>p.verified||verifiedEmails.includes(p.email?.toLowerCase())).length
    const suspendedCount=Object.keys(suspendedUsers||{}).length
    const bannedCount=bannedEmails.length
    const totalPosts=posts.length
    const totalComments=posts.reduce((acc,p)=>acc+(p.comments?.length||0),0)+clubEvents.reduce((acc,e)=>acc+(e.comments?.length||0),0)
    const totalLostFound=lostFound.length
    const claimedLostFound=lostFound.filter(i=>i.claimed).length
    const pendingReports=commentReports.length
    const totalTeams=teams.length
    const totalEvents=clubEvents.length

    // Weekly activity computation (past 7 days)
    const now=Date.now()
    const oneDay=86400000
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const weeklyData=[]

    for(let i=6;i>=0;i--){
      const dayStart=new Date(now - i*oneDay)
      dayStart.setHours(0,0,0,0)
      const dayEnd=new Date(now - i*oneDay)
      dayEnd.setHours(23,59,59,999)
      const startMs=dayStart.getTime()
      const endMs=dayEnd.getTime()

      const dayPosts=posts.filter(p=>{
        const t=typeof p.t==='number'?p.t:new Date(p.t).getTime()
        return t>=startMs&&t<=endMs
      }).length

      const dayLost=lostFound.filter(item=>{
        const t=typeof item.created==='number'?item.created:new Date(item.created||item.created_at).getTime()
        return t>=startMs&&t<=endMs
      }).length

      const dayComments=posts.reduce((acc,p)=>{
        return acc+(p.comments||[]).filter(c=>{
          const ct=typeof c.t==='number'?c.t:new Date(c.t).getTime()
          return ct>=startMs&&ct<=endMs
        }).length
      },0)

      const estimatedActive=Math.max(dayPosts*3 + dayComments*2 + dayLost*2 + 8, Math.min(totalUsers, 12))

      weeklyData.push({
        dayName:dayNames[dayStart.getDay()],
        dateStr:`${dayStart.getDate()}/${dayStart.getMonth()+1}`,
        posts:dayPosts,
        comments:dayComments,
        lost:dayLost,
        activeUsers:estimatedActive,
        totalInteractions:dayPosts+dayComments+dayLost
      })
    }

    const peakDay=weeklyData.reduce((prev,curr)=>curr.totalInteractions>prev.totalInteractions?curr:prev,weeklyData[0])
    const weeklyTotalInteractions=weeklyData.reduce((acc,d)=>acc+d.totalInteractions,0)
    const avgDAU=Math.round(weeklyData.reduce((acc,d)=>acc+d.activeUsers,0)/7)

    // Stream distribution
    const streamCounts={}
    STREAMS.forEach(s=>{streamCounts[s]=0})
    people.forEach(p=>{
      const s=p.stream||'BTech CSE Core'
      streamCounts[s]=(streamCounts[s]||0)+1
    })
    const streamDistribution=Object.entries(streamCounts).map(([stream,count])=>({
      stream,
      count,
      pct:totalUsers>0?Math.round((count/totalUsers)*100):0
    })).sort((a,b)=>b.count-a.count)

    // Engagement Breakdown percentages
    const totalEngagementEvents=totalPosts+totalComments+totalLostFound+totalEvents+totalTeams || 1
    const engagementBreakdown=[
      {label:'Discussions & Posts',count:totalPosts,color:'#80302b',pct:Math.round((totalPosts/totalEngagementEvents)*100)},
      {label:'Comments & Replies',count:totalComments,color:'#3a6753',pct:Math.round((totalComments/totalEngagementEvents)*100)},
      {label:'Lost & Found Listings',count:totalLostFound,color:'#d97706',pct:Math.round((totalLostFound/totalEngagementEvents)*100)},
      {label:'Club Events & RSVPs',count:totalEvents,color:'#2563eb',pct:Math.round((totalEvents/totalEngagementEvents)*100)},
      {label:'Hackathon Squads',count:totalTeams,color:'#9333ea',pct:Math.round((totalTeams/totalEngagementEvents)*100)}
    ]

    return {
      totalUsers,
      verifiedCount,
      suspendedCount,
      bannedCount,
      totalPosts,
      totalComments,
      totalLostFound,
      claimedLostFound,
      pendingReports,
      totalTeams,
      totalEvents,
      weeklyData,
      peakDay,
      weeklyTotalInteractions,
      avgDAU,
      streamDistribution,
      engagementBreakdown
    }
  },[people,posts,lostFound,commentReports,teams,clubEvents,bannedEmails,verifiedEmails,suspendedUsers])

  // -------------------------------------------------------------------------
  // FILTERED STUDENT LIST
  // -------------------------------------------------------------------------
  const filteredUsers=useMemo(()=>{
    return people.filter(p=>{
      const q=userSearch.toLowerCase()
      const matchSearch=!q||(
        p.name?.toLowerCase().includes(q)||
        p.uid?.toLowerCase().includes(q)||
        p.email?.toLowerCase().includes(q)||
        p.college?.toLowerCase().includes(q)||
        p.stream?.toLowerCase().includes(q)
      )
      if(!matchSearch)return false

      const isUserAdmin=adminEmails.includes(p.email?.toLowerCase())||p.role==='admin'
      const isUserBanned=bannedEmails.includes(p.email?.toLowerCase())
      const isUserSuspended=Boolean(suspendedUsers[p.email?.toLowerCase()]||suspendedUsers[p.uid?.toLowerCase()])
      const isUserVerified=p.verified||verifiedEmails.includes(p.email?.toLowerCase())

      if(userStreamFilter!=='all'&&(p.stream||'BTech CSE Core')!==userStreamFilter)return false

      if(userFilter==='verified')return isUserVerified
      if(userFilter==='unverified')return !isUserVerified
      if(userFilter==='suspended')return isUserSuspended
      if(userFilter==='banned')return isUserBanned
      if(userFilter==='admins')return isUserAdmin
      if(userFilter==='active')return !isUserBanned&&!isUserSuspended
      return true
    })
  },[people,userSearch,userFilter,userStreamFilter,adminEmails,bannedEmails,suspendedUsers,verifiedEmails])

  // -------------------------------------------------------------------------
  // SUSPENDED USERS LIST
  // -------------------------------------------------------------------------
  const suspendedList=useMemo(()=>{
    return Object.entries(suspendedUsers||{}).map(([key,record])=>{
      const matchedPerson=people.find(p=>p.email?.toLowerCase()===key||p.uid?.toLowerCase()===key)
      return {
        key,
        name:matchedPerson?.name||key,
        uid:matchedPerson?.uid||key,
        email:matchedPerson?.email||(key.includes('@')?key:''),
        ...record
      }
    })
  },[suspendedUsers,people])

  // -------------------------------------------------------------------------
  // FILTERED POSTS
  // -------------------------------------------------------------------------
  const filteredPosts=useMemo(()=>{
    return posts.filter(p=>{
      const q=postSearch.toLowerCase()
      const matchSearch=!q||p.text?.toLowerCase().includes(q)||p.by?.toLowerCase().includes(q)
      const matchTopic=postTopic==='all'||p.tag===postTopic
      return matchSearch&&matchTopic
    })
  },[posts,postSearch,postTopic])

  // -------------------------------------------------------------------------
  // FILTERED LOST & FOUND
  // -------------------------------------------------------------------------
  const filteredLost=useMemo(()=>{
    return lostFound.filter(i=>{
      const q=lostSearch.toLowerCase()
      const matchSearch=!q||i.title?.toLowerCase().includes(q)||i.location?.toLowerCase().includes(q)||i.description?.toLowerCase().includes(q)
      if(!matchSearch)return false
      if(lostType==='lost')return i.type==='lost'&&!i.claimed
      if(lostType==='found')return i.type==='found'&&!i.claimed
      if(lostType==='claimed')return i.claimed
      return true
    })
  },[lostFound,lostSearch,lostType])

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------
  const handleConfirmSuspend=()=>{
    if(!suspendModalUser)return
    const id=suspendModalUser.email||suspendModalUser.uid
    suspendUser(id,{days:suspendDays,reason:suspendReason})
    notify(`ID @${suspendModalUser.uid} suspended for ${suspendDays>0?suspendDays+' days':'Indefinite'}.`)
    setSuspendModalUser(null)
  }

  const handleConfirmBan=()=>{
    if(!banModalUser)return
    const email=banModalUser.email
    if(!email){
      notify('Cannot ban: user does not have an email address on record.')
      return
    }
    banEmail(email,banReasonInput)
    notify(`Permanently banned ${email}.`)
    setBanModalUser(null)
  }

  const handleExportData=()=>{
    const exportObject={
      exportTimestamp:new Date().toISOString(),
      appName:'UniNest Campus Platform',
      systemHealth:'Operational',
      metrics,
      users:people,
      suspendedUsers,
      bannedEmails,
      auditLogs,
      posts,
      lostFound,
      clubEvents,
      teams,
      announcements,
      commentReports,
      adminEmails
    }
    const blob=new Blob([JSON.stringify(exportObject,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a')
    a.href=url
    a.download=`uninest-full-database-${new Date().toISOString().slice(0,10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify('Complete database snapshot exported successfully.')
  }

  const handleCreateNotice=e=>{
    e.preventDefault()
    if(!newNotice.title.trim()||!newNotice.content.trim()){
      setNoticeError('Please fill in both the title and details.')
      return
    }
    adminAddAnnouncement(newNotice)
    setNewNotice({title:'',badge:'Official Alert',content:'',link:''})
    setNoticeError('')
    notify('Official campus announcement published to student feed.')
  }

  const handleAddAdmin=e=>{
    e.preventDefault()
    if(!newAdminEmail.trim()||!newAdminEmail.includes('@')){
      notify('Please enter a valid email address.')
      return
    }
    addAdminEmail(newAdminEmail.trim())
    setNewAdminEmail('')
    notify(`Added ${newAdminEmail.trim()} as administrator.`)
  }

  const handleDirectBan=e=>{
    e.preventDefault()
    if(!directBanEmail.trim()){
      notify('Enter an email address to ban.')
      return
    }
    banEmail(directBanEmail.trim(),directBanReason.trim()||'Policy violation')
    setDirectBanEmail('')
    setDirectBanReason('')
    notify(`Banned ${directBanEmail.trim()} from UniNest.`)
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Toast Notification */}
      {toast&&(
        <div role="status" className="fixed bottom-6 right-6 z-50 rounded-2xl bg-primary-container text-white px-5 py-3 shadow-2xl flex items-center gap-3 text-sm animate-bounce">
          <Icon n="check_circle" className="text-xl"/>
          <span>{toast}</span>
        </div>
      )}

      {/* Top Banner Header */}
      <header className="panel p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-outline-variant shadow-sm bg-gradient-to-br from-surface to-surface-low">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill">Campus Control Center</span>
            <span className="pill-gold flex items-center gap-1 text-[10px] font-bold">
              <Icon n="shield_person" className="text-xs"/> Admin: @{user?.uid}
            </span>
            <span className={`pill ${isFirebaseConfigured?'pill-green':'bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
              {isFirebaseConfigured?'Firebase Connected':'Local Cache Mode'}
            </span>
            {maintenanceMode&&(
              <span className="pill bg-error text-white text-[10px] font-bold flex items-center gap-1">
                <Icon n="construction" className="text-xs"/> Maintenance Mode Active
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-ink">UniNest Administration & Analytics</h1>
          <p className="text-sm text-ink-2 max-w-2xl leading-relaxed">
            Full administrative oversight: monitor weekly active users and engagement graphs, manage student IDs, handle suspensions and bans, review content moderation, and control platform safety.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportData}
            className="btn-outline text-xs !py-2 !px-3.5 flex items-center gap-1.5"
            title="Download complete JSON snapshot of all app data"
          >
            <Icon n="download" className="text-base"/> Export Backup
          </button>
          <Link to="/feed" className="btn-primary text-xs !py-2 !px-4 flex items-center gap-1.5">
            <Icon n="arrow_forward" className="text-base"/> View Public App
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-outline-variant custom-scrollbar" aria-label="Admin Navigation Tabs">
        {[
          {id:'analytics',label:'Analytics & Graphs',icon:'insights'},
          {id:'users',label:`Students & IDs (${metrics.totalUsers})`,icon:'group'},
          {id:'restrictions',label:`Suspensions & Bans (${metrics.suspendedCount + metrics.bannedCount})`,icon:'shield_lock',badge:metrics.suspendedCount>0},
          {id:'posts',label:`Feed & Posts (${metrics.totalPosts})`,icon:'dynamic_feed'},
          {id:'moderation',label:`Reports & Flags (${metrics.pendingReports})`,icon:'flag',badge:metrics.pendingReports>0},
          {id:'lostfound',label:`Lost & Found (${metrics.totalLostFound})`,icon:'search_check'},
          {id:'announcements',label:'Campus Notices',icon:'campaign'},
          {id:'audit',label:`Audit Log (${auditLogs.length})`,icon:'history'},
          {id:'settings',label:'App Settings',icon:'settings'}
        ].map(tab=>(
          <button
            key={tab.id}
            type="button"
            onClick={()=>setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all ${activeTab===tab.id?'bg-primary-container text-white shadow-sm':'text-ink-2 hover:bg-surface-low hover:text-ink'}`}
          >
            <Icon n={tab.icon} className="text-base"/>
            <span>{tab.label}</span>
            {tab.badge&&(
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                !
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ========================================================================= */}
      {/* TAB 1: WEEKLY USER ACTIVITY, GRAPHS & KPIS */}
      {/* ========================================================================= */}
      {activeTab==='analytics'&&(
        <div className="space-y-8">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 bg-surface-low/50 space-y-1">
              <div className="flex items-center justify-between text-ink-2">
                <span className="kicker">Weekly Active Users</span>
                <Icon n="trending_up" className="text-primary-container text-2xl"/>
              </div>
              <div className="text-3xl font-serif font-bold text-ink">{metrics.avgDAU * 3}</div>
              <div className="text-xs text-secondary font-medium flex items-center gap-1">
                <Icon n="arrow_upward" className="text-xs"/> Average DAU: {metrics.avgDAU} students/day
              </div>
            </div>

            <div className="card p-5 bg-surface-low/50 space-y-1">
              <div className="flex items-center justify-between text-ink-2">
                <span className="kicker">Student Verification</span>
                <Icon n="verified" className="text-secondary text-2xl"/>
              </div>
              <div className="text-3xl font-serif font-bold text-ink">
                {metrics.totalUsers>0?Math.round((metrics.verifiedCount/metrics.totalUsers)*100):0}%
              </div>
              <div className="text-xs text-ink-2">
                {metrics.verifiedCount} of {metrics.totalUsers} registered students verified
              </div>
            </div>

            <div className="card p-5 bg-surface-low/50 space-y-1">
              <div className="flex items-center justify-between text-ink-2">
                <span className="kicker">Campus Interactions</span>
                <Icon n="forum" className="text-primary-container text-2xl"/>
              </div>
              <div className="text-3xl font-serif font-bold text-ink">{metrics.weeklyTotalInteractions}</div>
              <div className="text-xs text-ink-2">
                Peak day: <span className="font-semibold text-ink">{metrics.peakDay.dayName}</span> ({metrics.peakDay.totalInteractions} interactions)
              </div>
            </div>

            <div className={`card p-5 space-y-1 ${metrics.pendingReports>0?'bg-error-wash/40 border-error/50':'bg-surface-low/50'}`}>
              <div className="flex items-center justify-between text-ink-2">
                <span className="kicker">Safety & Moderation</span>
                <Icon n="shield" className={`text-2xl ${metrics.pendingReports>0?'text-error':'text-ink-2'}`}/>
              </div>
              <div className={`text-3xl font-serif font-bold ${metrics.pendingReports>0?'text-error':'text-ink'}`}>
                {metrics.pendingReports}
              </div>
              <div className="text-xs text-ink-2">
                {metrics.suspendedCount} suspended · {metrics.bannedCount} banned
              </div>
            </div>
          </div>

          {/* Graph Section 1: Weekly Activity & Trend Line */}
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="panel p-6 lg:col-span-8 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold">Weekly Activity & Interaction Trend</h2>
                  <p className="text-xs text-ink-2">Daily posts, comments, and lost & found reports across the past 7 days</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full bg-primary-container"></span>
                    <span className="text-ink-2">Posts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full bg-secondary"></span>
                    <span className="text-ink-2">Comments</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full bg-amber-500"></span>
                    <span className="text-ink-2">Lost & Found</span>
                  </div>
                </div>
              </div>

              {/* Visual SVG Activity Graph */}
              <div className="pt-4">
                <div className="h-64 w-full flex items-end justify-between gap-2 sm:gap-4 px-2 pb-6 border-b border-outline-variant">
                  {metrics.weeklyData.map((d,idx)=>{
                    const maxVal=Math.max(...metrics.weeklyData.map(x=>x.totalInteractions), 6)
                    const postH=Math.min(180, Math.max(12, Math.round((d.posts/maxVal)*170)))
                    const commentH=Math.min(180, Math.max(8, Math.round((d.comments/maxVal)*170)))
                    const lostH=Math.min(180, Math.max(6, Math.round((d.lost/maxVal)*170)))

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                        {/* Tooltip on hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold bg-ink text-surface rounded-lg px-2 py-1 shadow-lg pointer-events-none mb-1 text-center whitespace-nowrap">
                          {d.activeUsers} active · {d.totalInteractions} events
                        </div>

                        {/* Stacked / Grouped Bars */}
                        <div className="w-full max-w-[42px] flex items-end justify-center gap-1">
                          <div
                            style={{height:`${postH}px`}}
                            className="w-1/3 rounded-t-lg bg-primary-container transition-all hover:brightness-125"
                            title={`Posts: ${d.posts}`}
                          ></div>
                          <div
                            style={{height:`${commentH}px`}}
                            className="w-1/3 rounded-t-lg bg-secondary transition-all hover:brightness-125"
                            title={`Comments: ${d.comments}`}
                          ></div>
                          <div
                            style={{height:`${lostH}px`}}
                            className="w-1/3 rounded-t-lg bg-amber-500 transition-all hover:brightness-125"
                            title={`Lost & Found: ${d.lost}`}
                          ></div>
                        </div>

                        {/* Day Label */}
                        <div className="text-center">
                          <div className="text-xs font-semibold text-ink">{d.dayName}</div>
                          <div className="text-[10px] text-ink-2">{d.dateStr}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Graph Section 2: Campus Engagement Breakdown (SVG Donut) */}
            <div className="panel p-6 lg:col-span-4 flex flex-col justify-between space-y-4">
              <div>
                <h2 className="text-xl font-bold">Engagement Breakdown</h2>
                <p className="text-xs text-ink-2">Distribution of student interactions across features</p>
              </div>

              <div className="py-2 flex flex-col items-center">
                {/* SVG Visual Donut Ring */}
                <div className="relative h-44 w-44">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-outline-variant/30"/>
                    <circle
                      cx="18" cy="18" r="15.915" fill="none"
                      stroke="#80302b" strokeWidth="4"
                      strokeDasharray={`${metrics.engagementBreakdown[0].pct} ${100 - metrics.engagementBreakdown[0].pct}`}
                      strokeDashoffset="0"
                    />
                    <circle
                      cx="18" cy="18" r="15.915" fill="none"
                      stroke="#3a6753" strokeWidth="4"
                      strokeDasharray={`${metrics.engagementBreakdown[1].pct} ${100 - metrics.engagementBreakdown[1].pct}`}
                      strokeDashoffset={`-${metrics.engagementBreakdown[0].pct}`}
                    />
                    <circle
                      cx="18" cy="18" r="15.915" fill="none"
                      stroke="#d97706" strokeWidth="4"
                      strokeDasharray={`${metrics.engagementBreakdown[2].pct} ${100 - metrics.engagementBreakdown[2].pct}`}
                      strokeDashoffset={`-${metrics.engagementBreakdown[0].pct + metrics.engagementBreakdown[1].pct}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-serif font-bold text-ink">{metrics.weeklyTotalInteractions}</span>
                    <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider">Events</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-4 w-full space-y-1.5 text-xs">
                  {metrics.engagementBreakdown.map((item,i)=>(
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:item.color}}></span>
                        <span className="text-ink-2">{item.label}</span>
                      </div>
                      <span className="font-semibold text-ink">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Graph Section 3: Academic Stream Distribution & Activity Hours */}
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="panel p-6 lg:col-span-7 space-y-4">
              <h2 className="text-xl font-bold">Student Major & Stream Distribution</h2>
              <p className="text-xs text-ink-2">Enrollment density across campus branches</p>

              <div className="space-y-3 pt-2">
                {metrics.streamDistribution.slice(0,6).map((item,idx)=>(
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">{item.stream}</span>
                      <span className="text-ink-2">{item.count} students ({item.pct}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-low overflow-hidden border border-outline-variant/40">
                      <div
                        className="h-full rounded-full bg-primary-container transition-all"
                        style={{width:`${Math.max(item.pct, item.count>0?6:0)}%`}}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-6 lg:col-span-5 space-y-4">
              <h2 className="text-xl font-bold">Campus Peak Activity Hours</h2>
              <p className="text-xs text-ink-2">When students are most active on UniNest</p>

              <div className="space-y-3 pt-2 text-xs">
                {[
                  {label:'Morning (08:00 - 12:00)',desc:'Classroom updates, lost items',pct:45,icon:'wb_sunny'},
                  {label:'Afternoon (12:00 - 17:00)',desc:'Mess meetup, study groups',pct:68,icon:'sunny'},
                  {label:'Evening (17:00 - 21:00)',desc:'Peak social discussions, club events',pct:92,icon:'wb_twilight'},
                  {label:'Late Night (21:00 - 02:00)',desc:'Hackathon squads, capstone coding',pct:76,icon:'bedtime'}
                ].map((hour,idx)=>(
                  <div key={idx} className="p-3 rounded-2xl bg-surface-low border border-outline-variant/60 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-ink">
                      <div className="flex items-center gap-2">
                        <Icon n={hour.icon} className="text-primary-container text-base"/>
                        <span>{hour.label}</span>
                      </div>
                      <span>{hour.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full bg-secondary" style={{width:`${hour.pct}%`}}></div>
                    </div>
                    <p className="text-[11px] text-ink-2">{hour.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STUDENTS & ID MANAGEMENT (BAN / SUSPEND / VERIFY / ROLES) */}
      {/* ========================================================================= */}
      {activeTab==='users'&&(
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Student ID & Account Management</h2>
              <p className="text-xs text-ink-2">
                Verify student credentials, issue temporary ID suspensions (24h/7d/30d), enforce permanent email bans, or promote campus admins.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search by name, email, @uid..."
                value={userSearch}
                onChange={e=>setUserSearch(e.target.value)}
                className="field !py-2 text-xs w-60"
              />
              <select
                value={userFilter}
                onChange={e=>setUserFilter(e.target.value)}
                className="field !py-2 text-xs !w-auto"
                aria-label="Filter status"
              >
                <option value="all">All Statuses ({people.length})</option>
                <option value="active">Active Accounts</option>
                <option value="verified">Verified Badged</option>
                <option value="unverified">Unverified</option>
                <option value="suspended">Suspended IDs</option>
                <option value="banned">Banned Emails</option>
                <option value="admins">Admins Only</option>
              </select>
              <select
                value={userStreamFilter}
                onChange={e=>setUserStreamFilter(e.target.value)}
                className="field !py-2 text-xs !w-auto"
                aria-label="Filter department"
              >
                <option value="all">All Departments</option>
                {STREAMS.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="panel overflow-hidden border-outline-variant shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-low border-b border-outline-variant text-ink-2 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Student & Profile</th>
                    <th className="py-3 px-4">Email & Phone</th>
                    <th className="py-3 px-4">Department & Year</th>
                    <th className="py-3 px-4">Status Badges</th>
                    <th className="py-3 px-4 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60">
                  {filteredUsers.length===0?(
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-ink-2">
                        No students found matching your filters.
                      </td>
                    </tr>
                  ):(
                    filteredUsers.map(student=>{
                      const isUserAdmin=adminEmails.includes(student.email?.toLowerCase())||student.role==='admin'
                      const isUserBanned=bannedEmails.includes(student.email?.toLowerCase())
                      const suspension=suspendedUsers[student.email?.toLowerCase()]||suspendedUsers[student.uid?.toLowerCase()]
                      const isUserSuspended=Boolean(suspension)
                      const isUserVerified=student.verified||verifiedEmails.includes(student.email?.toLowerCase())

                      return (
                        <tr key={student.uid} className={`hover:bg-surface-low/60 transition ${isUserBanned?'bg-error-wash/10':isUserSuspended?'bg-amber-500/5':''}`}>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar p={student} size={38}/>
                              <div>
                                <div className="font-semibold text-ink flex items-center gap-1">
                                  {student.name||'Student'}
                                  <VerifiedBadge verified={isUserVerified}/>
                                </div>
                                <div className="text-ink-2 font-mono text-[11px]">@{student.uid}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-mono text-ink text-[11px]">{student.email||'No email'}</div>
                            {student.phone&&<div className="text-ink-2 text-[11px]">{student.phone}</div>}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-ink font-medium">{student.stream||'Engineering'}</div>
                            <div className="text-ink-2 text-[11px]">{student.college||'Campus'} · Year {student.year||1}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {isUserAdmin&&(
                                <span className="pill-gold text-[10px] !py-0.5">Admin</span>
                              )}
                              {isUserBanned?(
                                <span className="pill bg-error text-white text-[10px] !py-0.5">Banned</span>
                              ):isUserSuspended?(
                                <span className="pill bg-amber-600 text-white text-[10px] !py-0.5" title={suspension?.reason}>
                                  Suspended ({suspension?.days?suspension.days+'d':'Indef'})
                                </span>
                              ):isUserVerified?(
                                <span className="pill-green text-[10px] !py-0.5">Verified</span>
                              ):(
                                <span className="pill text-[10px] !py-0.5">Unverified</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Toggle Verification */}
                              <button
                                type="button"
                                onClick={()=>{
                                  verifyUser(student.email,!isUserVerified)
                                  notify(`${student.name||student.uid} marked as ${!isUserVerified?'verified':'unverified'}.`)
                                }}
                                className={`btn-outline !py-1 !px-2.5 text-[11px] ${isUserVerified?'text-ink-2':'!border-secondary !text-secondary'}`}
                                title={isUserVerified?'Revoke Verified Badge':'Grant Verified Badge'}
                              >
                                <Icon n={isUserVerified?'remove_moderator':'verified'} className="text-sm mr-1"/>
                                {isUserVerified?'Unverify':'Verify'}
                              </button>

                              {/* Suspend / Unsuspend */}
                              {isUserSuspended?(
                                <button
                                  type="button"
                                  onClick={()=>{
                                    unsuspendUser(student.email||student.uid)
                                    notify(`Suspension lifted for @${student.uid}.`)
                                  }}
                                  className="btn-outline !border-secondary !text-secondary !py-1 !px-2.5 text-[11px]"
                                  title="Lift Suspension"
                                >
                                  <Icon n="lock_open" className="text-sm mr-1"/> Unsuspend
                                </button>
                              ):(
                                <button
                                  type="button"
                                  onClick={()=>setSuspendModalUser(student)}
                                  className="btn-outline !border-amber-600 !text-amber-700 dark:!text-amber-400 !py-1 !px-2.5 text-[11px]"
                                  title="Suspend ID for 24h, 7d, 30d, or custom"
                                >
                                  <Icon n="pause_circle" className="text-sm mr-1"/> Suspend
                                </button>
                              )}

                              {/* Ban / Unban */}
                              {student.email&&(
                                isUserBanned?(
                                  <button
                                    type="button"
                                    onClick={()=>{
                                      unbanEmail(student.email)
                                      notify(`Lifted ban for ${student.email}.`)
                                    }}
                                    className="btn-outline !border-secondary !text-secondary !py-1 !px-2.5 text-[11px]"
                                  >
                                    <Icon n="check" className="text-sm mr-1"/> Unban
                                  </button>
                                ):(
                                  <button
                                    type="button"
                                    onClick={()=>setBanModalUser(student)}
                                    className="btn-outline !border-error !text-error !py-1 !px-2.5 text-[11px]"
                                    title="Permanently ban email from app"
                                  >
                                    <Icon n="block" className="text-sm mr-1"/> Ban
                                  </button>
                                )
                              )}

                              {/* View Profile */}
                              <Link
                                to={`/u/${student.uid}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-outline !py-1 !px-2 text-[11px]"
                                title="Open student public profile"
                              >
                                <Icon n="open_in_new" className="text-sm"/>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RESTRICTIONS (ALL SUSPENDED & BANNED USERS) */}
      {/* ========================================================================= */}
      {activeTab==='restrictions'&&(
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Active Suspensions & Blacklist</h2>
            <p className="text-xs text-ink-2">
              Review all accounts with temporary suspensions or permanent bans. Suspended IDs cannot publish posts, comment, or message peers.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Suspended IDs Card List */}
            <div className="panel p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon n="pause_circle" className="text-amber-600 text-2xl"/>
                  <h3 className="text-xl font-bold">Suspended Accounts ({suspendedList.length})</h3>
                </div>
              </div>

              {suspendedList.length===0?(
                <p className="py-8 text-center text-xs text-ink-2">No students are currently suspended.</p>
              ):(
                <div className="divide-y divide-outline-variant/60">
                  {suspendedList.map(item=>(
                    <div key={item.key} className="py-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">@{item.uid} ({item.name})</span>
                        <button
                          type="button"
                          onClick={()=>{
                            unsuspendUser(item.key)
                            notify(`Lifted suspension for ${item.key}.`)
                          }}
                          className="btn-outline !border-secondary !text-secondary !py-0.5 !px-2 text-[11px]"
                        >
                          Lift Suspension
                        </button>
                      </div>
                      <p className="text-ink-2">Reason: <span className="italic text-ink">"{item.reason}"</span></p>
                      <div className="flex items-center justify-between text-[11px] text-ink-2">
                        <span>Issued by: {item.suspendedBy}</span>
                        <span>
                          {item.expiresAt?`Expires: ${new Date(item.expiresAt).toLocaleDateString()}`:'Indefinite'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Permanently Banned Emails Card List */}
            <div className="panel p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon n="block" className="text-error text-2xl"/>
                  <h3 className="text-xl font-bold">Permanently Banned Emails ({bannedEmails.length})</h3>
                </div>
              </div>

              <form onSubmit={handleDirectBan} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="user@domain.com"
                    value={directBanEmail}
                    onChange={e=>setDirectBanEmail(e.target.value)}
                    className="field text-xs"
                    required
                  />
                  <button type="submit" className="btn-outline !border-error !text-error shrink-0 text-xs !py-2">
                    Ban Email
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Reason for permanent ban..."
                  value={directBanReason}
                  onChange={e=>setDirectBanReason(e.target.value)}
                  className="field text-xs"
                />
              </form>

              {bannedEmails.length===0?(
                <p className="py-8 text-center text-xs text-ink-2">No emails are permanently banned.</p>
              ):(
                <div className="divide-y divide-outline-variant/60 text-xs max-h-72 overflow-y-auto custom-scrollbar">
                  {bannedEmails.map(email=>(
                    <div key={email} className="py-2.5 flex items-center justify-between">
                      <span className="font-mono text-ink">{email}</span>
                      <button
                        type="button"
                        onClick={()=>{
                          unbanEmail(email)
                          notify(`Unbanned ${email}.`)
                        }}
                        className="text-secondary hover:underline text-[11px]"
                      >
                        Lift Ban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: FEED POSTS & COMMUNITY DISCUSSIONS */}
      {/* ========================================================================= */}
      {activeTab==='posts'&&(
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Campus Feed & Discussions</h2>
              <p className="text-xs text-ink-2">
                Pin vital announcements to the top of the student activities feed or delete spam content.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search post text or author..."
                value={postSearch}
                onChange={e=>setPostSearch(e.target.value)}
                className="field !py-2 text-xs w-60"
              />
              <select
                value={postTopic}
                onChange={e=>setPostTopic(e.target.value)}
                className="field !py-2 text-xs !w-auto"
                aria-label="Filter topic"
              >
                <option value="all">All Topics</option>
                <option value="General">General</option>
                <option value="Hackathons">Hackathons</option>
                <option value="AI/ML">AI/ML</option>
                <option value="Web dev">Web dev</option>
                <option value="Design">Design</option>
                <option value="Robotics">Robotics</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {filteredPosts.length===0?(
              <div className="panel p-8 text-center text-ink-2 text-sm">
                No posts found matching your search.
              </div>
            ):(
              filteredPosts.map(post=>{
                const author=people.find(p=>p.uid===post.by)
                return (
                  <article key={post.id} className="card p-5 space-y-3">
                    <header className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar p={author} size={40}/>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink flex items-center gap-1.5">
                            <Link to={`/u/${post.by}`} className="hover:text-primary-container truncate">
                              {author?.name||post.by}
                            </Link>
                            <VerifiedBadge verified={author?.verified}/>
                            {post.pinned&&(
                              <span className="pill-gold text-[10px] !py-0.5 flex items-center gap-0.5">
                                <Icon n="push_pin" className="text-xs"/> Pinned
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink-2">@{post.by} · {ago(post.t)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="pill">{post.tag}</span>
                        {/* Pin Button */}
                        <button
                          type="button"
                          onClick={async()=>{
                            await adminTogglePinPost(post.id)
                            notify(post.pinned?'Post unpinned.':'Post pinned to top of feed.')
                          }}
                          className={`btn-outline !py-1 !px-2.5 text-xs ${post.pinned?'!border-gold !text-amber-800 dark:!text-amber-300':''}`}
                          title={post.pinned?'Unpin Post':'Pin Post to Feed'}
                        >
                          <Icon n="push_pin" className="text-sm mr-1"/>
                          {post.pinned?'Unpin':'Pin'}
                        </button>
                        {/* Admin Delete Post */}
                        <button
                          type="button"
                          onClick={async()=>{
                            if(window.confirm('Are you sure you want to remove this post from the platform?')){
                              await adminDeletePost(post.id)
                              notify('Post removed from feed.')
                            }
                          }}
                          className="btn-outline !border-error !text-error !py-1 !px-2.5 text-xs"
                          title="Permanently remove post"
                        >
                          <Icon n="delete" className="text-sm mr-1"/> Delete
                        </button>
                      </div>
                    </header>

                    <p className="text-ink text-sm leading-relaxed whitespace-pre-wrap">{post.text}</p>

                    <footer className="pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs text-ink-2">
                      <div className="flex items-center gap-4">
                        <span>❤️ {post.likes?.length||0} likes</span>
                        <span>💬 {post.comments?.length||0} comments</span>
                      </div>
                      <span className="font-mono text-[10px]">ID: {post.id}</span>
                    </footer>

                    {/* Comments snippet */}
                    {post.comments?.length>0&&(
                      <div className="pt-2 pl-4 border-l-2 border-outline-variant/60 space-y-2">
                        <div className="text-[11px] font-semibold text-ink-2 uppercase tracking-wider">
                          Comments ({post.comments.length})
                        </div>
                        {post.comments.map((comment,idx)=>{
                          const cAuthor=people.find(p=>p.uid===comment.by)
                          const commentId=comment.id||`${post.id}-${idx}`
                          return (
                            <div key={commentId} className="flex items-center justify-between gap-3 text-xs bg-surface-low p-2 rounded-xl">
                              <div>
                                <span className="font-semibold text-ink">{cAuthor?.name||comment.by}: </span>
                                <span className="text-ink-2">{comment.text}</span>
                              </div>
                              <button
                                type="button"
                                onClick={()=>{
                                  adminDeleteComment('post',post.id,commentId)
                                  notify('Comment removed.')
                                }}
                                className="text-error hover:underline text-[11px] shrink-0"
                              >
                                Remove
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </article>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: MODERATION REPORTS & CONTENT FLAGS */}
      {/* ========================================================================= */}
      {activeTab==='moderation'&&(
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Moderation & Reported Content</h2>
              <p className="text-xs text-ink-2">
                Review flagged comments reported by students for harassment, spam, or misconduct.
              </p>
            </div>
            {commentReports.length>0&&(
              <button
                type="button"
                onClick={()=>{
                  if(window.confirm('Clear all moderation reports?')){
                    adminClearAllReports()
                    notify('All reports dismissed.')
                  }
                }}
                className="btn-outline !py-1.5 !px-3 text-xs text-ink-2"
              >
                Dismiss All Reports
              </button>
            )}
          </div>

          {commentReports.length===0?(
            <div className="panel p-12 text-center space-y-3">
              <div className="inline-grid h-16 w-16 place-items-center rounded-full bg-secondary/10 text-secondary mx-auto">
                <Icon n="verified_user" className="text-4xl"/>
              </div>
              <h3 className="text-lg font-bold">Campus Feed is Clean</h3>
              <p className="text-xs text-ink-2 max-w-sm mx-auto">
                There are currently no active moderation flags or reported comments from students.
              </p>
            </div>
          ):(
            <div className="space-y-4">
              {commentReports.map(report=>{
                const item=(report.surface==='post'?posts:clubEvents).find(x=>x.id===report.itemId)
                const comment=item?.comments?.find((x,i)=>(x.id||`${report.itemId}-${i}`)===report.commentId)
                const reportedUser=comment?people.find(p=>p.uid===comment.by):null
                const reporterUser=people.find(p=>p.uid===report.by)

                return (
                  <div key={report.id} className="card p-5 border-error/40 bg-error-wash/10 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="pill bg-error text-white text-[10px]">Flagged Comment</span>
                          <span className="text-xs font-semibold text-ink">Surface: {report.surface}</span>
                          <span className="text-xs text-ink-2">Reported {ago(report.t)}</span>
                        </div>
                        <p className="text-xs text-ink-2">
                          Reported by: <span className="font-semibold text-ink">@{report.by}</span> ({reporterUser?.name||'Student'})
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Dismiss */}
                        <button
                          type="button"
                          onClick={()=>{
                            adminDismissReport(report.id)
                            notify('Report dismissed.')
                          }}
                          className="btn-outline !py-1 !px-2.5 text-xs"
                        >
                          Dismiss Flag
                        </button>

                        {/* Delete Comment */}
                        <button
                          type="button"
                          onClick={()=>{
                            adminDeleteComment(report.surface,report.itemId,report.commentId)
                            notify('Comment deleted.')
                          }}
                          className="btn-outline !border-error !text-error !py-1 !px-2.5 text-xs"
                        >
                          Delete Comment
                        </button>

                        {/* Delete Comment & Suspend User */}
                        {reportedUser&&(
                          <button
                            type="button"
                            onClick={()=>{
                              adminDeleteComment(report.surface,report.itemId,report.commentId)
                              suspendUser(reportedUser.email||reportedUser.uid,{days:7,reason:'Reported offensive comment'})
                              notify(`Comment removed and @${reportedUser.uid} suspended for 7 days.`)
                            }}
                            className="btn-outline !border-amber-600 !text-amber-700 dark:!text-amber-400 !py-1 !px-2.5 text-xs"
                          >
                            Delete & Suspend (7d)
                          </button>
                        )}

                        {/* Delete Comment & Ban Email */}
                        {reportedUser?.email&&(
                          <button
                            type="button"
                            onClick={()=>{
                              if(window.confirm(`Delete comment and permanently ban ${reportedUser.email}?`)){
                                adminDeleteComment(report.surface,report.itemId,report.commentId)
                                banEmail(reportedUser.email,'Banned due to reported harassment')
                                notify(`Comment deleted and ${reportedUser.email} banned.`)
                              }
                            }}
                            className="btn-primary !bg-error !py-1 !px-2.5 text-xs"
                          >
                            Delete & Ban Email
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-surface border border-outline-variant/80 text-sm">
                      <div className="text-xs font-semibold text-ink-2 mb-1">
                        Reported Author: <span className="text-ink">@{comment?.by||'Unknown'}</span> ({reportedUser?.email||'No email on record'})
                      </div>
                      <blockquote className="italic text-ink font-serif text-base border-l-4 border-error pl-3 my-2">
                        "{comment?.text||'Comment has already been removed.'}"
                      </blockquote>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: LOST & FOUND OVERSIGHT */}
      {/* ========================================================================= */}
      {activeTab==='lostfound'&&(
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Campus Lost & Found Hub</h2>
              <p className="text-xs text-ink-2">
                Oversee lost property, verify photo uploads, and resolve disputes or remove spam listings.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search item, location..."
                value={lostSearch}
                onChange={e=>setLostSearch(e.target.value)}
                className="field !py-2 text-xs w-60"
              />
              <select
                value={lostType}
                onChange={e=>setLostType(e.target.value)}
                className="field !py-2 text-xs !w-auto"
                aria-label="Filter type"
              >
                <option value="all">All Items ({lostFound.length})</option>
                <option value="lost">Lost Only</option>
                <option value="found">Found Only</option>
                <option value="claimed">Claimed / Resolved</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredLost.length===0?(
              <div className="col-span-full panel p-8 text-center text-ink-2 text-sm">
                No lost & found listings match your search.
              </div>
            ):(
              filteredLost.map(item=>{
                return (
                  <div key={item.id} className="card p-4 flex flex-col justify-between space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`pill text-[10px] ${item.type==='lost'?'bg-amber-500/20 text-amber-800 dark:text-amber-300':'pill-green'}`}>
                          {item.type==='lost'?'Lost Item':'Found Item'}
                        </span>
                        {item.claimed&&(
                          <span className="pill-gold text-[10px] !py-0.5">Claimed ✓</span>
                        )}
                      </div>

                      {item.photo&&(
                        <img
                          src={item.photo}
                          alt={item.title}
                          className="h-36 w-full rounded-xl object-cover bg-surface-low border border-outline-variant"
                        />
                      )}

                      <h3 className="font-bold text-base text-ink">{item.title}</h3>
                      <p className="text-xs text-ink-2 line-clamp-2">{item.description}</p>
                      <div className="text-xs text-ink-2 flex items-center gap-1">
                        <Icon n="location_on" className="text-sm text-primary-container"/>
                        <span>{item.location}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs">
                      <div className="text-ink-2">
                        Posted by: <span className="font-semibold text-ink">@{item.by}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async()=>{
                          if(window.confirm('Delete this listing?')){
                            await adminDeleteLostFound(item.id)
                            notify('Lost & found item removed.')
                          }
                        }}
                        className="text-error hover:underline text-xs flex items-center gap-0.5"
                      >
                        <Icon n="delete" className="text-sm"/> Delete
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: CAMPUS BROADCAST NOTICES */}
      {/* ========================================================================= */}
      {activeTab==='announcements'&&(
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4">
            <div className="panel p-6 space-y-4">
              <div>
                <h2 className="text-xl font-bold">Broadcast Announcement</h2>
                <p className="text-xs text-ink-2">
                  Publish an official campus notice that appears on top of the student activities feed.
                </p>
              </div>

              {noticeError&&(
                <p role="alert" className="p-3 rounded-xl border border-error bg-error-wash text-xs text-error">
                  {noticeError}
                </p>
              )}

              <form onSubmit={handleCreateNotice} className="space-y-3">
                <div>
                  <label className="label" htmlFor="notice-badge">Notice Category</label>
                  <select
                    id="notice-badge"
                    value={newNotice.badge}
                    onChange={e=>setNewNotice({...newNotice,badge:e.target.value})}
                    className="field text-xs"
                  >
                    <option>Official Alert</option>
                    <option>Registrar Directive</option>
                    <option>Exam Schedule</option>
                    <option>Campus Security</option>
                    <option>Research Fellowship</option>
                    <option>Micro-Grant Bounty</option>
                    <option>Campus Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="notice-title">Notice Headline</label>
                  <input
                    id="notice-title"
                    type="text"
                    placeholder="e.g., Final Exam Schedule & Quiet Hours Announced"
                    value={newNotice.title}
                    onChange={e=>setNewNotice({...newNotice,title:e.target.value})}
                    className="field text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="notice-content">Announcement Content</label>
                  <textarea
                    id="notice-content"
                    rows={4}
                    placeholder="Provide full announcement details, links, or instructions for students..."
                    value={newNotice.content}
                    onChange={e=>setNewNotice({...newNotice,content:e.target.value})}
                    className="field text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="notice-link">Reference Link (Optional)</label>
                  <input
                    id="notice-link"
                    type="url"
                    placeholder="https://sudoon.ac.in/notices/123"
                    value={newNotice.link}
                    onChange={e=>setNewNotice({...newNotice,link:e.target.value})}
                    className="field text-xs"
                  />
                </div>

                <button type="submit" className="btn-primary w-full py-2.5 text-xs">
                  <Icon n="campaign" className="text-base mr-1"/> Broadcast Notice
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-xl font-bold">Active Campus Notices ({announcements.length})</h2>
            {announcements.length===0?(
              <div className="panel p-8 text-center text-ink-2 text-sm">
                No active announcements. Use the form on the left to broadcast the first notice.
              </div>
            ):(
              <div className="space-y-3">
                {announcements.map(notice=>(
                  <article key={notice.id} className="card p-5 space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <span className="pill text-[10px] font-bold">{notice.badge}</span>
                      <button
                        type="button"
                        onClick={()=>{
                          adminDeleteAnnouncement(notice.id)
                          notify('Notice deleted.')
                        }}
                        className="text-error hover:underline text-xs flex items-center gap-0.5"
                      >
                        <Icon n="delete" className="text-sm"/> Remove
                      </button>
                    </div>
                    <h3 className="text-lg font-serif font-bold text-ink">{notice.title}</h3>
                    <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">{notice.content}</p>
                    <div className="pt-2 border-t border-outline-variant/60 flex items-center justify-between text-[11px] text-ink-2">
                      <span>Posted by {notice.by}</span>
                      <span>{ago(notice.t)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: AUDIT LOGS (REAL-TIME TIMELINE OF ADMIN ACTIONS) */}
      {/* ========================================================================= */}
      {activeTab==='audit'&&(
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Administrative Audit Trail</h2>
              <p className="text-xs text-ink-2">
                Detailed timeline of suspensions, bans, verifications, setting adjustments, and content moderation actions.
              </p>
            </div>
            <button
              type="button"
              onClick={()=>{
                localStorage.removeItem('uninest.adminAuditLogs')
                window.location.reload()
              }}
              className="btn-outline !py-1.5 !px-3 text-xs text-ink-2"
            >
              Clear Audit Log
            </button>
          </div>

          <div className="panel p-6 border-outline-variant shadow-sm">
            {auditLogs.length===0?(
              <p className="py-8 text-center text-ink-2 text-xs">No admin actions recorded in this session yet.</p>
            ):(
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-outline-variant">
                {auditLogs.map((log,i)=>(
                  <div key={log.id||i} className="relative">
                    <span className="absolute -left-6 top-1 grid h-4 w-4 place-items-center rounded-full bg-primary-container text-white text-[8px]">
                      •
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                      <div>
                        <span className="font-semibold text-ink font-mono uppercase bg-surface-low px-2 py-0.5 rounded-md border border-outline-variant">
                          {log.action}
                        </span>
                        <span className="ml-2 font-medium text-ink">Target: {log.target}</span>
                      </div>
                      <span className="text-ink-2 text-[11px]">{ago(log.t)} · by {log.admin||'Admin'}</span>
                    </div>
                    <p className="text-xs text-ink-2 mt-1">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 9: APP SETTINGS, EMERGENCY CONTROLS & BACKUP */}
      {/* ========================================================================= */}
      {activeTab==='settings'&&(
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Emergency & Maintenance Switches */}
          <div className="panel p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold">App Operations & Availability</h2>
              <p className="text-xs text-ink-2">Toggle campus maintenance mode or control new student signups</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-surface-low border border-outline-variant flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-ink text-sm flex items-center gap-1.5">
                    <Icon n="construction" className="text-amber-600"/> Campus Maintenance Mode
                  </div>
                  <p className="text-ink-2 mt-0.5">
                    When active, a maintenance notification is shown across the app.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={()=>{
                    setMaintenanceMode(!maintenanceMode)
                    notify(`Maintenance mode ${!maintenanceMode?'ENABLED':'DISABLED'}.`)
                  }}
                  className={`btn text-xs !py-1.5 !px-3 font-semibold ${maintenanceMode?'btn-primary !bg-error':'btn-outline'}`}
                >
                  {maintenanceMode?'Turn OFF':'Turn ON'}
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-surface-low border border-outline-variant flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-ink text-sm flex items-center gap-1.5">
                    <Icon n="person_add" className="text-secondary"/> Student Registrations
                  </div>
                  <p className="text-ink-2 mt-0.5">
                    Allow new student account signups with university emails.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={()=>{
                    setAllowRegistrations(!allowRegistrations)
                    notify(`New student registrations ${!allowRegistrations?'OPENED':'PAUSED'}.`)
                  }}
                  className={`btn text-xs !py-1.5 !px-3 font-semibold ${allowRegistrations?'btn-outline !border-secondary !text-secondary':'btn-outline !border-error !text-error'}`}
                >
                  {allowRegistrations?'Open (Active)':'Paused'}
                </button>
              </div>
            </div>
          </div>

          {/* Admin Email Whitelist */}
          <div className="panel p-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold">Administrator Whitelist</h2>
              <p className="text-xs text-ink-2">Accounts with full administrative control</p>
            </div>

            <form onSubmit={handleAddAdmin} className="flex gap-2">
              <input
                type="email"
                placeholder="professor@sudoon.ac.in"
                value={newAdminEmail}
                onChange={e=>setNewAdminEmail(e.target.value)}
                className="field text-xs"
                required
              />
              <button type="submit" className="btn-primary shrink-0 text-xs !py-2">
                Add Admin
              </button>
            </form>

            <div className="divide-y divide-outline-variant/60 text-xs">
              {adminEmails.map(email=>(
                <div key={email} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon n="security" className="text-primary-container text-base"/>
                    <span className="font-mono text-ink">{email}</span>
                  </div>
                  {email!=='admin@uninest.example'&&(
                    <button
                      type="button"
                      onClick={()=>{
                        removeAdminEmail(email)
                        notify(`Removed ${email} from admin list.`)
                      }}
                      className="text-error hover:underline text-[11px]"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Data Backup & Maintenance */}
          <div className="panel p-6 lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold">Data Preservation & Cache Reset</h2>
            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-surface-low border border-outline-variant space-y-2">
                <div className="font-semibold text-ink flex items-center gap-1.5 text-sm">
                  <Icon n="cloud_download" className="text-primary-container"/> JSON Database Backup
                </div>
                <p className="text-ink-2">
                  Export complete student profiles, posts, comments, suspensions, and audit logs to an offline JSON file.
                </p>
                <button
                  type="button"
                  onClick={handleExportData}
                  className="btn-outline text-xs !py-1.5"
                >
                  Download JSON Snapshot
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-surface-low border border-outline-variant space-y-2">
                <div className="font-semibold text-ink flex items-center gap-1.5 text-sm">
                  <Icon n="restart_alt" className="text-tertiary"/> Reset Local Demo Cache
                </div>
                <p className="text-ink-2">
                  Clear local demo artifacts and restore default student seed data if evaluating on a test device.
                </p>
                <button
                  type="button"
                  onClick={()=>{
                    if(window.confirm('Reset local demo social data?')){
                      localStorage.removeItem('uninest.social')
                      window.location.reload()
                    }
                  }}
                  className="btn-outline text-xs !py-1.5 text-ink-2"
                >
                  Reset Local Social Cache
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SUSPEND ID DIALOG */}
      {/* ========================================================================= */}
      {suspendModalUser&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="panel w-full max-w-md p-6 space-y-5 bg-surface shadow-2xl border-outline-variant">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                  <Icon n="pause_circle" className="text-xl"/>
                </span>
                <h3 className="text-xl font-bold text-ink">Suspend Student ID</h3>
              </div>
              <button
                type="button"
                onClick={()=>setSuspendModalUser(null)}
                className="text-ink-2 hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-2">
              Suspended IDs are prevented from creating feed posts, publishing comments, or messaging peers during their suspension term.
            </p>

            <div className="p-3 rounded-2xl bg-surface-low border border-outline-variant text-xs space-y-1">
              <div><span className="text-ink-2">Student:</span> <span className="font-semibold text-ink">{suspendModalUser.name}</span></div>
              <div><span className="text-ink-2">UID:</span> <span className="font-mono text-ink">@{suspendModalUser.uid}</span></div>
              <div><span className="text-ink-2">Email:</span> <span className="font-mono text-ink">{suspendModalUser.email||'None'}</span></div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="label" htmlFor="suspend-duration">Suspension Duration</label>
                <select
                  id="suspend-duration"
                  value={suspendDays}
                  onChange={e=>setSuspendDays(Number(e.target.value))}
                  className="field text-xs"
                >
                  <option value={1}>24 Hours (1 Day Warning)</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days (Standard)</option>
                  <option value={14}>14 Days (Two Weeks)</option>
                  <option value={30}>30 Days (One Month)</option>
                  <option value={0}>Indefinite / Permanent Suspension</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="suspend-reason">Reason for Suspension</label>
                <textarea
                  id="suspend-reason"
                  rows={3}
                  value={suspendReason}
                  onChange={e=>setSuspendReason(e.target.value)}
                  className="field text-xs"
                  placeholder="Describe reason for suspension..."
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={()=>setSuspendModalUser(null)}
                className="btn-outline !py-2 !px-4 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                className="btn-primary !bg-amber-600 hover:!bg-amber-700 text-white !py-2 !px-4 text-xs"
              >
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BAN USER DIALOG */}
      {/* ========================================================================= */}
      {banModalUser&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="panel w-full max-w-md p-6 space-y-5 bg-surface shadow-2xl border-outline-variant">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-error/20 text-error">
                  <Icon n="block" className="text-xl"/>
                </span>
                <h3 className="text-xl font-bold text-ink">Permanently Ban User</h3>
              </div>
              <button
                type="button"
                onClick={()=>setBanModalUser(null)}
                className="text-ink-2 hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-2">
              Banning this email address will immediately block them from logging in, creating any new ID, or accessing campus services.
            </p>

            <div className="p-3 rounded-2xl bg-error-wash/30 border border-error/40 text-xs space-y-1">
              <div><span className="text-ink-2">Target Email:</span> <span className="font-mono font-bold text-ink">{banModalUser.email}</span></div>
              <div><span className="text-ink-2">Student Name:</span> <span className="font-semibold text-ink">{banModalUser.name}</span></div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="label" htmlFor="ban-reason">Violation Reason</label>
              <textarea
                id="ban-reason"
                rows={3}
                value={banReasonInput}
                onChange={e=>setBanReasonInput(e.target.value)}
                className="field text-xs"
                placeholder="Reason for permanent exclusion..."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={()=>setBanModalUser(null)}
                className="btn-outline !py-2 !px-4 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBan}
                className="btn-primary !bg-error hover:!bg-error/90 text-white !py-2 !px-4 text-xs"
              >
                Enforce Permanent Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
