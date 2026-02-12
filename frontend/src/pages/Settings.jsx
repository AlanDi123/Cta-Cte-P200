import { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  User, 
  Lock, 
  Bell, 
  Palette,
  Database,
  Printer,
  Mail,
  Save,
  Loader2
} from 'lucide-react';
import useAuthStore from '../store/authStore';

const Settings = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);

  const tabs = [
    { id: 'profile', name: 'Perfil', icon: User },
    { id: 'security', name: 'Seguridad', icon: Lock },
    { id: 'notifications', name: 'Notificaciones', icon: Bell },
    { id: 'appearance', name: 'Apariencia', icon: Palette },
    { id: 'system', name: 'Sistema', icon: Database },
  ];

  const handleSave = async () => {
    setSaving(true);
    // TODO: Implement save functionality
    setTimeout(() => {
      setSaving(false);
      alert('Configuración guardada exitosamente');
    }, 1000);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Personalice su experiencia en el sistema
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 
            border border-gray-200 dark:border-gray-700">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg
                      transition-colors ${
                        activeTab === tab.id
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 
            border border-gray-200 dark:border-gray-700">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Información del Perfil
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Nombre
                      </label>
                      <input
                        type="text"
                        defaultValue={user?.nombre}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Usuario
                      </label>
                      <input
                        type="text"
                        defaultValue={user?.usuario}
                        disabled
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        defaultValue={user?.email}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Rol
                      </label>
                      <input
                        type="text"
                        defaultValue={user?.rol}
                        disabled
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 capitalize"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Cambiar Contraseña
                  </h2>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Contraseña Actual
                      </label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Nueva Contraseña
                      </label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Confirmar Nueva Contraseña
                      </label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Preferencias de Notificaciones
                  </h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg
                      bg-gray-50 dark:bg-gray-700/50">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Stock bajo
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Recibir alertas cuando el stock está por debajo del mínimo
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 
                          peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer 
                          dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white 
                          after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                          after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 
                          after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg
                      bg-gray-50 dark:bg-gray-700/50">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Pagos vencidos
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Notificar sobre clientes con pagos vencidos
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 
                          peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer 
                          dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white 
                          after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                          after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 
                          after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg
                      bg-gray-50 dark:bg-gray-700/50">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Nuevas ventas
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Recibir notificaciones de nuevas ventas realizadas
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 
                          peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer 
                          dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white 
                          after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                          after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 
                          after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Personalización
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tema
                      </label>
                      <select
                        className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="light">Claro</option>
                        <option value="dark">Oscuro</option>
                        <option value="auto">Automático</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tamaño de Fuente
                      </label>
                      <select
                        className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="small">Pequeño</option>
                        <option value="medium">Mediano</option>
                        <option value="large">Grande</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'system' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Configuración del Sistema
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Impresora por Defecto
                      </label>
                      <select
                        className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Seleccionar impresora...</option>
                        <option value="ticket">Impresora de Tickets</option>
                        <option value="laser">Impresora Láser</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Formato de Factura
                      </label>
                      <select
                        className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="a">Factura A</option>
                        <option value="b">Factura B</option>
                        <option value="c">Factura C</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Moneda
                      </label>
                      <select
                        className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="ARS">Peso Argentino (ARS)</option>
                        <option value="USD">Dólar (USD)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 
                  disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
