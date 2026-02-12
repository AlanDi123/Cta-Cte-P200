import { Menu, Moon, Sun, Bell, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';

const Header = ({ onMenuClick }) => {
  const { user } = useAuthStore();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [notifications] = useState([]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6">
      <div className="flex items-center justify-between h-full">
        {/* Left side - Menu button */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 
              text-gray-600 dark:text-gray-300 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="hidden lg:block">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Sistema POS - Sol Verde
            </h1>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center space-x-2">
          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700
              text-gray-600 dark:text-gray-300 transition-colors"
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <button
            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700
              text-gray-600 dark:text-gray-300 transition-colors"
            title="Notificaciones"
          >
            <Bell className="w-5 h-5" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {/* User menu */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg
            bg-gray-50 dark:bg-gray-700/50">
            <User className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-300">
              {user?.nombre || 'Usuario'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
