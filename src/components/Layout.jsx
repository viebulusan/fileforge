import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useSession } from '../lib/auth-client.js'

const navLinks = [
  { to: '/convert', label: 'convert' },
  { to: '/documents', label: 'documents' },
  { to: '/tools', label: 'tools' },
  { to: '/download', label: 'download' },
  { to: '/pricing', label: 'pricing' },
  { to: '/contact', label: 'contact' },
]

export default function Layout() {
  const { data: session } = useSession()
  const user = session?.user
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const toggleRef = useRef(null)
  const [lastPath, setLastPath] = useState(location.pathname)

  // close the menu whenever the route changes
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // crossing to the desktop breakpoint closes the overlay so the body
  // scroll-lock can never get stuck after a resize/rotation
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (event) => {
      if (event.matches) setMenuOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // escape closes + scroll lock while open
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const mobileItems = [
    ...navLinks.map((link, index) => ({ ...link, num: `0${index + 1}` })),
    user
      ? { to: '/account', label: user.name || user.email, num: '//', account: true }
      : { to: '/login', label: 'sign in', num: '//' },
  ]
  const isAccountItem = (item) => item.account === true

  return (
    <div className="flex min-h-svh flex-col bg-paper">
      <header
        className={`sticky inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-line bg-[rgba(10,10,9,0.82)] backdrop-blur-[14px]'
            : 'border-b border-transparent'
        }`}
      >
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex shrink-0 items-baseline gap-2.5">
            <span className="font-mono text-[15px] font-bold tracking-[0.06em] text-ink">
              FileForge<span className="text-copper">_</span>
            </span>
          </Link>

          {/* desktop nav */}
          <nav className="ml-6 hidden items-center gap-6 lg:flex lg:gap-8">
            {navLinks.map((link, index) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `inline-flex items-baseline gap-1.5 font-mono text-[0.72rem] font-medium uppercase tracking-[0.16em] transition ${
                    isActive ? 'text-copper' : 'text-ink-faint hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden="true"
                      className={`text-[0.58rem] transition-colors ${
                        isActive ? 'text-copper' : 'text-line-strong'
                      }`}
                    >
                      0{index + 1}
                    </span>
                    {link.label}
                  </>
                )}
              </NavLink>
            ))}
            {user ? (
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  `inline-flex max-w-32 items-center gap-2 truncate rounded-sm border px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] transition ${
                    isActive
                      ? 'border-copper text-copper'
                      : 'border-line-strong text-ink-soft hover:border-copper/60 hover:text-ink'
                  }`
                }
              >
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-copper motion-safe:animate-[pulse-dot_2s_ease-in-out_infinite]" />
                {user.name || user.email}
              </NavLink>
            ) : (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `font-mono text-[0.72rem] font-medium uppercase tracking-[0.16em] transition ${
                    isActive ? 'text-copper' : 'text-ink-faint hover:text-ink'
                  }`
                }
              >
                sign in
              </NavLink>
            )}
          </nav>

          {/* mobile burger */}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="group relative z-[60] flex size-10 flex-col items-center justify-center gap-[5px] rounded-sm border border-line-strong bg-paper-raised/80 transition hover:border-copper/60 lg:hidden"
          >
            <span
              className={`block h-px w-4.5 bg-ink transition-all duration-300 ease-out ${
                menuOpen ? 'translate-y-[3px] rotate-45 bg-copper' : 'group-hover:w-3.5 group-active:bg-copper'
              }`}
            />
            <span
              className={`block h-px w-4.5 bg-ink transition-all duration-300 ease-out ${
                menuOpen ? '-translate-y-[3px] -rotate-45 bg-copper' : 'group-hover:w-3.5 group-hover:delay-75 group-active:bg-copper'
              }`}
            />
          </button>
        </div>
      </header>

      {/* mobile menu panel — lives OUTSIDE <header> on purpose: the scrolled
          header applies `backdrop-blur`, which turns it into a containing
          block and breaks `position: fixed` for any descendant overlay */}
      <div
        id="mobile-menu"
        className={`fixed inset-0 top-16 z-40 flex flex-col bg-[rgba(10,10,9,0.96)] backdrop-blur-xl transition-all duration-300 ease-out lg:hidden ${
          menuOpen ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-copper/40 to-transparent"
          />
          <nav aria-label="Mobile" className="flex flex-1 flex-col justify-center gap-1 px-8 pb-24">
            {mobileItems.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                tabIndex={menuOpen ? 0 : -1}
                style={{ transitionDelay: menuOpen ? `${80 + index * 55}ms` : '0ms' }}
                className={({ isActive }) =>
                  `group flex items-baseline gap-4 border-b border-line py-4 transition-all duration-500 ease-out ${
                    menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                  } ${isActive ? 'text-copper' : 'text-ink hover:text-copper-deep'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden="true"
                      className={`font-mono text-[0.62rem] tracking-[0.2em] transition-colors ${
                        isActive ? 'text-copper' : 'text-line-strong group-hover:text-copper/70'
                      }`}
                    >
                      {item.num}
                    </span>
                    <span
                      className={`truncate font-mono text-lg font-medium uppercase tracking-[0.14em] ${
                        isAccountItem(item) ? 'normal-case tracking-normal' : ''
                      }`}
                    >
                      {item.label}
                    </span>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="ml-auto size-1.5 shrink-0 self-center rounded-full bg-copper motion-safe:animate-[pulse-dot_2s_ease-in-out_infinite]"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-8 bottom-10 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.22em] text-ink-faint transition-opacity delay-300 duration-700 ${
              menuOpen ? 'opacity-70' : 'opacity-0'
            }`}
          >
            <span>your files never leave this device</span>
            <span className="text-copper">▊</span>
          </div>
      </div>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 font-mono text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 FileForge</span>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-4">
            <Link to="/contact" className="transition hover:text-copper-deep">contact</Link>
            <Link to="/terms" className="transition hover:text-copper-deep">terms</Link>
            <Link to="/privacy" className="transition hover:text-copper-deep">privacy</Link>
            <Link to="/disclaimer" className="transition hover:text-copper-deep">disclaimer</Link>
          </nav>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-copper motion-safe:animate-[pulse-dot_2s_ease-in-out_infinite]" />
            your files never leave this device
          </span>
        </div>
      </footer>
    </div>
  )
}
