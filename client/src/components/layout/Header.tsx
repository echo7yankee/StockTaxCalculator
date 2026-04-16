import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, Settings, TrendingUp, LogOut, User, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Skeleton } from '../common/Skeleton';

export default function Header() {
  const { t } = useTranslation(['header', 'common']);
  const { theme, toggleTheme } = useTheme();
  const { user, loading, logout } = useAuth();

  const isPaid = user?.plan === 'paid';

  const navLinks = [
    { to: '/', label: t('header:home') },
    { to: '/calculator', label: t('header:calculator') },
    ...(isPaid ? [{ to: '/dashboard', label: t('header:dashboard') }] : []),
    { to: '/filing-guide', label: t('header:filingGuide') },
    ...(!isPaid ? [{ to: '/pricing', label: t('header:pricing') }] : []),
  ];
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close mobile nav on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    setMenuOpen(false);
    setMobileNavOpen(false);
    await logout();
    navigate('/');
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-navy-900/80 backdrop-blur-md border-b border-gray-200 dark:border-navy-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-accent font-bold text-xl">
            <TrendingUp className="w-6 h-6" />
            <span>InvesTax</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'bg-accent/10 text-accent'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-navy-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
              aria-label={t('header:toggleTheme')}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link
              to="/settings"
              className="hidden sm:block p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
              aria-label={t('header:settings')}
            >
              <Settings className="w-5 h-5" />
            </Link>

            {/* Auth — desktop */}
            {!loading && !user && (
              <div className="hidden md:flex items-center gap-2 ml-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors"
                >
                  {t('common:logIn')}
                </Link>
                <Link
                  to="/signup"
                  className="btn-primary text-sm px-3 py-1.5"
                >
                  {t('common:signUp')}
                </Link>
              </div>
            )}

            {/* Auth — loading skeleton (Section 3.9 Sites 1+4) — reserves worst-case width to prevent jump */}
            {loading && (
              <div
                className="ml-2 flex items-center"
                aria-busy="true"
                role="status"
                data-testid="header-auth-skeleton"
              >
                <span className="sr-only">{t('common:loadingAuth')}</span>
                {/* Desktop: reserve login + signup button cluster width */}
                <Skeleton h={28} className="hidden md:block w-44" rounded="md" />
                {/* Mobile: reserve avatar slot width */}
                <Skeleton h={32} className="md:hidden" w={32} rounded="full" />
              </div>
            )}

            {/* User avatar — all sizes */}
            {!loading && user && (
              <div className="relative ml-2" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-8 h-8 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center hover:bg-accent-hover transition-colors"
                  title={user.email}
                >
                  {initials}
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-600 rounded-xl shadow-lg py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-navy-700">
                      <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.email}</p>
                    </div>
                    <Link
                      to="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700"
                    >
                      <User className="w-4 h-4" />
                      {t('header:dashboard')}
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700 md:hidden"
                    >
                      <Settings className="w-4 h-4" />
                      {t('header:settings')}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('common:logOut')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="md:hidden p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
              aria-label={mobileNavOpen ? t('header:closeMenu') : t('header:menu')}
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav panel */}
      {mobileNavOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900">
          <nav className="px-4 py-3 space-y-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'bg-accent/10 text-accent'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/settings"
              className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700"
            >
              {t('header:settings')}
            </Link>
          </nav>

          {/* Auth — mobile */}
          {!loading && !user && (
            <div className="px-4 pb-3 pt-1 border-t border-gray-100 dark:border-navy-700 flex gap-2">
              <Link to="/login" className="flex-1 text-center py-2 text-sm font-medium text-gray-600 dark:text-slate-400 border border-gray-300 dark:border-navy-500 rounded-lg">
                {t('common:logIn')}
              </Link>
              <Link to="/signup" className="flex-1 text-center btn-primary text-sm py-2">
                {t('common:signUp')}
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
