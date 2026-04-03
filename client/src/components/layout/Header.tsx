import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, Settings, TrendingUp, LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

export default function Header() {
  const { t } = useTranslation(['header', 'common']);
  const { theme, toggleTheme } = useTheme();
  const { user, loading, logout } = useAuth();

  const navLinks = [
    { to: '/', label: t('header:home') },
    { to: '/calculator', label: t('header:calculator') },
    { to: '/dashboard', label: t('header:dashboard') },
    { to: '/filing-guide', label: t('header:filingGuide') },
  ];
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
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

  const handleLogout = async () => {
    setMenuOpen(false);
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
            <span>StockTax</span>
          </Link>

          {/* Nav */}
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
              className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
              aria-label={t('header:settings')}
            >
              <Settings className="w-5 h-5" />
            </Link>

            {/* Auth */}
            {!loading && !user && (
              <div className="hidden sm:flex items-center gap-2 ml-2">
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
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-600 rounded-xl shadow-lg py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-navy-700">
                      <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{user.email}</p>
                    </div>
                    <Link
                      to="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700"
                    >
                      <User className="w-4 h-4" />
                      {t('header:dashboard')}
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
          </div>
        </div>
      </div>
    </header>
  );
}
