import {useEffect,useRef,useState} from 'react'
import {NavLink,Link,Outlet,useLocation,useNavigate} from 'react-router-dom'
import {useAuth} from '../auth.jsx'
import {useSocial} from '../social.jsx'
import {Avatar,VerifiedBadge,ago} from './ui.jsx'

export const Icon=({n,className=''})=><span className={`material-symbols-outlined ${className}`} aria-hidden="true">{n}</span>

const nav=[
  ['/','Homepage','home'],
  ['/discover','Discover','explore'],
  ['/feed','Activities','dynamic_feed'],
  ['/messages','Messages','chat_bubble'],
  ['/events','Events','event'],
  ['/club-events','Club events','groups'],
  ['/lost-found','Lost & found','search_check']
]

const Section=({title,links})=><div><h4 className="kicker mb-3">{title}</h4><ul className="space-y-2 text-sm">{links.map(l=><li key={l}><a href="#" className="hover:text-primary-container hover:underline">{l}</a></li>)}</ul></div>

export default function Layout(){
  const {user,logout,isAdmin,maintenanceMode}=useAuth(),s=useSocial(),go=useNavigate(),desktopNoticeRef=useRef(null),mobileNoticeRef=useRef(null),noticeDialogRef=useRef(null),{pathname}=useLocation(),[open,setOpen]=useState(false),[noticeOpen,setNoticeOpen]=useState(false),[tick,setTick]=useState(0)
  const [dark,setDark]=useState(()=>{
    if(typeof window==='undefined')return false
    try{
      const saved=localStorage.getItem('uninest.theme')
      if(saved)return saved==='dark'
    }catch(e){}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches||false
  })

  useEffect(()=>{
    const root=document.documentElement
    if(dark){
      root.classList.add('dark')
      try{localStorage.setItem('uninest.theme','dark')}catch(e){}
    }else{
      root.classList.remove('dark')
      try{localStorage.setItem('uninest.theme','light')}catch(e){}
    }
  },[dark])

  const notices=user?[...s.notifications(),...s.pendingConnectionRequests().map(r=>({id:r.id,type:'connection',from:r.from,person:r.person,request:r,t:r.created_at||r.t}))]:[],unread=notices.length
  useEffect(()=>{window.scrollTo(0,0);setOpen(false)},[pathname])
  useEffect(()=>{
    const close=e=>{
      if(
        noticeDialogRef.current&&!noticeDialogRef.current.contains(e.target)&&
        (!desktopNoticeRef.current||!desktopNoticeRef.current.contains(e.target))&&
        (!mobileNoticeRef.current||!mobileNoticeRef.current.contains(e.target))
      ){
        setNoticeOpen(false)
      }
    }
    document.addEventListener('mousedown',close)
    return()=>document.removeEventListener('mousedown',close)
  },[])

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface text-ink transition-colors duration-200">
      {/* Desktop Left Sidebar (like Instagram) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 border-r border-outline-variant bg-surface z-40 p-3 select-none overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="flex flex-col space-y-4">
          <div className="px-3 py-1">
            <Link to="/" className="flex items-center gap-3">
              <img src="/WEB%20LOGO.png" alt="UniNest" className="h-10 w-28 object-contain dark:brightness-125" />
              <span className="sr-only">UniNest</span>
            </Link>
          </div>

          <nav className="flex-1 space-y-1" aria-label="Campus navigation">
            {nav.map(([to,label,icon])=>(
              <NavLink
                key={to}
                to={to}
                end={to==='/'}
                className={({isActive})=>`flex items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all ${isActive?'bg-primary-container text-white shadow-sm':'text-ink-2 hover:bg-surface-low hover:text-primary-container'}`}
              >
                <Icon n={icon} className="text-2xl"/>
                <span className="truncate">{label}</span>
              </NavLink>
            ))}

            {/* Desktop Admin Dashboard Link - ONLY visible when logged in as Admin */}
            {isAdmin&&(
              <NavLink
                to="/admin"
                className={({isActive})=>`flex items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all ${isActive?'bg-primary-container text-white shadow-sm':'text-ink-2 hover:bg-surface-low hover:text-primary-container'}`}
              >
                <Icon n="admin_panel_settings" className="text-2xl text-amber-700 dark:text-amber-400"/>
                <span className="truncate flex-1">Admin Panel</span>
                <span className="pill-gold text-[9px] !py-0 !px-1.5 uppercase font-bold tracking-wider">Admin</span>
              </NavLink>
            )}

            {/* Desktop Notifications Button */}
            {user&&(
              <div ref={desktopNoticeRef}>
                <button
                  type="button"
                  onClick={()=>setNoticeOpen(!noticeOpen)}
                  aria-expanded={noticeOpen}
                  className={`flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all ${noticeOpen?'bg-primary-wash text-primary-container font-bold':'text-ink-2 hover:bg-surface-low hover:text-primary-container'}`}
                >
                  <div className="relative flex items-center justify-center">
                    <Icon n="notifications" className="text-2xl"/>
                    {unread>0&&(
                      <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                        {unread>9?'9+':unread}
                      </span>
                    )}
                  </div>
                  <span>Notifications</span>
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Bottom Area: Dark Mode & Profile */}
        <div className="mt-auto shrink-0 border-t border-outline-variant/60 pt-3 pb-2 space-y-1.5">
          <button
            type="button"
            onClick={()=>setDark(!dark)}
            aria-label={dark?'Switch to light mode':'Switch to dark mode'}
            className="flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-low hover:text-primary-container transition-all"
          >
            <Icon n={dark?'light_mode':'dark_mode'} className="text-2xl"/>
            <span>{dark?'Light mode':'Dark mode'}</span>
          </button>

          {user?(
            <div className="pt-1">
              <Link to={`/u/${user.uid}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-low transition">
                <Avatar p={user} size={36}/>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-xs font-semibold">{user.name}<VerifiedBadge verified={user.verified}/></div>
                  <div className="truncate text-[11px] text-ink-2">@{user.uid}</div>
                </div>
              </Link>
              <button
                onClick={()=>{logout();go('/')}}
                className="mt-2 btn-outline !py-2 !text-xs w-full"
              >
                Log out
              </button>
            </div>
          ):(
            <div className="pt-1 space-y-1.5">
              <Link to="/login" className="btn-outline w-full py-2 text-sm text-center">
                Log in
              </Link>
              <Link to="/signup" className="flex w-full items-center justify-center rounded-full bg-primary-container text-white hover:bg-primary py-2 text-sm font-semibold transition shadow-sm">
                Create ID
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Shared Notifications Dialog (Desktop & Mobile) */}
      {user && noticeOpen && (
        <div
          ref={noticeDialogRef}
          role="dialog"
          aria-label="Notifications"
          className="fixed top-14 right-3 md:right-auto md:left-64 md:top-12 md:ml-3 z-50 w-[calc(100vw-1.5rem)] sm:w-[360px] max-w-[360px] rounded-2xl border border-outline-variant bg-surface shadow-2xl overflow-hidden"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <button
              className="rounded-full px-3 py-1 text-xs font-semibold text-primary-container dark:text-primary hover:bg-primary-wash transition"
              onClick={()=>{s.markNotificationsRead();setTick(tick+1)}}
            >
              Mark all as read
            </button>
          </header>
          {s.notificationError&&(
            <p role="alert" className="flex items-center justify-between gap-3 border-b border-error bg-error-wash px-4 py-3 text-xs text-error">
              <span>{s.notificationError}</span>
              <button className="shrink-0 font-semibold underline" onClick={s.retryNotifications}>Retry</button>
            </p>
          )}
          {!notices.length?(
            <p className="px-4 py-10 text-center text-sm text-ink-2">No notifications yet</p>
          ):(
            <ul className="max-h-[min(28rem,70vh)] overflow-y-auto py-1">
              {notices.map(n=>n.type==='connection'?(
                <li key={n.id} className="border-b border-outline-variant/60 px-4 py-3">
                  <div className="flex gap-3">
                    <Avatar p={n.person} size={40}/>
                    <div className="min-w-0 flex-1 text-sm">
                      <p><b>{n.person?.name||'A student'}</b> sent you a connection request.</p>
                      <p className="mt-1 text-xs text-ink-2">{ago(n.t)}</p>
                      {n.request&&(
                        <div className="mt-2 flex gap-2">
                          <button className="btn-primary !px-3 !py-1 text-xs" onClick={()=>{s.respondConnection(n.request.id,true);setTick(tick+1)}}>Accept</button>
                          <button className="btn-outline !px-3 !py-1 text-xs" onClick={()=>{s.respondConnection(n.request.id,false);setTick(tick+1)}}>Decline</button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ):(
                <li key={n.id} className="border-b border-outline-variant/60 px-4 py-3 hover:bg-surface-low transition">
                  <Link className="flex gap-3 text-sm" to={n.person?.uid?`/messages?to=${encodeURIComponent(n.person.uid)}`:'/messages'} onClick={()=>setNoticeOpen(false)}>
                    <Avatar p={n.person} size={40}/>
                    <span className="min-w-0 flex-1"><b>{n.person?.name||'Someone'}</b> sent you a message.<span className="mt-1 block text-xs text-ink-2">{ago(n.t)}</span></span>
                    <Icon n="chat_bubble" className="text-primary-container dark:text-primary"/>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Main Content Area (offset by sidebar width on desktop) */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0 min-h-screen">
        {/* Mobile Top Header */}
        <header className="md:hidden border-b border-outline-variant bg-surface sticky top-0 z-30 px-4 py-2.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/WEB%20LOGO.png" alt="UniNest" className="h-9 w-24 object-contain dark:brightness-125" />
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={()=>setDark(!dark)}
              aria-label={dark?'Switch to light mode':'Switch to dark mode'}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-surface-low transition"
            >
              <Icon n={dark?'light_mode':'dark_mode'} className="text-xl"/>
            </button>
            {user&&(
              <button
                ref={mobileNoticeRef}
                type="button"
                onClick={()=>setNoticeOpen(!noticeOpen)}
                aria-label="Notifications"
                aria-expanded={noticeOpen}
                className="relative grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-surface-low transition"
              >
                <Icon n="notifications" className="text-xl"/>
                {unread>0&&(
                  <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                    {unread>9?'9+':unread}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={()=>setOpen(!open)}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-surface-low transition"
              aria-label="Menu"
            >
              <Icon n={open?'close':'menu'} className="text-xl"/>
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Drawer when hamburger open */}
        {open&&(
          <div className="md:hidden border-b border-outline-variant bg-surface p-4 space-y-2 z-20 shadow-md">
            {nav.map(([to,label,icon])=>(
              <NavLink
                key={to}
                to={to}
                end={to==='/'}
                onClick={()=>setOpen(false)}
                className={({isActive})=>`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${isActive?'bg-primary-container text-white':'text-ink-2 hover:bg-surface-low'}`}
              >
                <Icon n={icon}/>
                <span>{label}</span>
              </NavLink>
            ))}
            {isAdmin&&(
              <NavLink
                to="/admin"
                onClick={()=>setOpen(false)}
                className={({isActive})=>`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${isActive?'bg-primary-container text-white':'text-ink-2 hover:bg-surface-low'}`}
              >
                <Icon n="admin_panel_settings" className="text-amber-700 dark:text-amber-400"/>
                <span className="flex-1">Admin Panel</span>
                <span className="pill-gold text-[9px] !py-0 !px-1.5 uppercase font-bold">Admin</span>
              </NavLink>
            )}
            {user?(
              <div className="border-t border-outline-variant pt-3 flex items-center justify-between">
                <Link to={`/u/${user.uid}`} onClick={()=>setOpen(false)} className="flex items-center gap-2">
                  <Avatar p={user} size={32}/>
                  <span className="text-sm font-semibold">{user.name}</span>
                </Link>
                <button onClick={()=>{logout();go('/');setOpen(false)}} className="btn-outline !py-1 text-xs">
                  Log out
                </button>
              </div>
            ):(
              <div className="border-t border-outline-variant pt-3 flex gap-2">
                <Link to="/login" onClick={()=>setOpen(false)} className="btn-outline flex-1 text-center text-xs">Log in</Link>
                <Link to="/signup" onClick={()=>setOpen(false)} className="btn-primary flex-1 text-center text-xs">Create ID</Link>
              </div>
            )}
          </div>
        )}

        {/* Main Content View */}
        <main className="flex-1 mx-auto w-full max-w-[1200px] px-4 md:px-10 py-6 md:py-8 space-y-8 pb-20 md:pb-8">
          {maintenanceMode&&(
            <div role="alert" className="rounded-2xl border border-amber-600/60 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Icon n="construction" className="text-base text-amber-600"/>
                <span><b>Campus Maintenance Active:</b> Some campus services may be temporarily limited during scheduled administrative maintenance.</span>
              </div>
              {isAdmin&&(
                <Link to="/admin" className="font-semibold text-[10px] uppercase tracking-wider bg-amber-600 text-white px-2.5 py-1 rounded-full shrink-0">
                  Manage Settings
                </Link>
              )}
            </div>
          )}
          <Outlet/>
        </main>

        {/* Footer */}
        <footer className="border-t border-outline-variant bg-surface-low mt-10 py-10 px-4 md:px-10 pb-20 md:pb-10">
          <div className="mx-auto max-w-[1200px] grid gap-8 md:grid-cols-4">
            <div>
              <div className="font-serif text-xl font-semibold">UniNest</div>
              <p className="mt-2 text-sm text-ink-2 max-w-xs">Find study groups, project partners and hackathon squads on your campus.</p>
            </div>
            <Section title="Product" links={["How it works","Features","Events","Discover"]}/>
            <Section title="Explore" links={['Create an ID','Log in','Find teammates','Hackathons']}/>
            <div>
              <h4 className="kicker mb-3">Company</h4>
              <p className="text-sm text-ink-2">UniNest is an early-stage startup built for students.</p>
            </div>
            <p className="md:col-span-4 border-t border-outline-variant pt-4 text-xs text-ink-2">© 2025 UniNest. <Link to="/privacy-policy" className="hover:text-primary-container hover:underline">Privacy Policy</Link> · Terms</p>
          </div>
        </footer>

        {/* Mobile Instagram-Style Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-outline-variant bg-surface/95 backdrop-blur-md px-3 py-2 flex items-center justify-around shadow-lg">
          <NavLink to="/" end className={({isActive})=>`flex flex-col items-center py-1 px-3 rounded-full transition ${isActive?'text-primary-container font-bold':'text-ink-2'}`}>
            <Icon n="home" className="text-2xl"/>
            <span className="text-[10px] mt-0.5">Home</span>
          </NavLink>
          <NavLink to="/discover" className={({isActive})=>`flex flex-col items-center py-1 px-3 rounded-full transition ${isActive?'text-primary-container font-bold':'text-ink-2'}`}>
            <Icon n="explore" className="text-2xl"/>
            <span className="text-[10px] mt-0.5">Discover</span>
          </NavLink>
          <NavLink to="/feed" className={({isActive})=>`flex flex-col items-center py-1 px-3 rounded-full transition ${isActive?'text-primary-container font-bold':'text-ink-2'}`}>
            <Icon n="dynamic_feed" className="text-2xl"/>
            <span className="text-[10px] mt-0.5">Feed</span>
          </NavLink>
          <NavLink to="/messages" className={({isActive})=>`flex flex-col items-center py-1 px-3 rounded-full transition ${isActive?'text-primary-container font-bold':'text-ink-2'}`}>
            <Icon n="chat_bubble" className="text-2xl"/>
            <span className="text-[10px] mt-0.5">Messages</span>
          </NavLink>
          {user?(
            <NavLink to={`/u/${user.uid}`} className={({isActive})=>`flex flex-col items-center py-1 px-3 rounded-full transition ${isActive?'text-primary-container font-bold':'text-ink-2'}`}>
              <Avatar p={user} size={24}/>
              <span className="text-[10px] mt-0.5">Profile</span>
            </NavLink>
          ):(
            <NavLink to="/login" className={({isActive})=>`flex flex-col items-center py-1 px-3 rounded-full transition ${isActive?'text-primary-container font-bold':'text-ink-2'}`}>
              <Icon n="account_circle" className="text-2xl"/>
              <span className="text-[10px] mt-0.5">Log in</span>
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  )
}