import { useQuery } from '@tanstack/react-query';
import { 
  DollarSign, 
  Package, 
  AlertTriangle, 
  Users, 
  TrendingUp,
  TrendingDown,
  Loader2
} from 'lucide-react';
import { dashboardAPI, productsAPI, clientsAPI } from '../services/api';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: dashboardAPI.getKPIs,
  });

  const { data: criticalStock } = useQuery({
    queryKey: ['critical-stock'],
    queryFn: productsAPI.getCriticalStock,
  });

  const { data: overdueClients } = useQuery({
    queryKey: ['overdue-clients'],
    queryFn: clientsAPI.getOverdue,
  });

  if (kpisLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  const kpiData = kpis?.data || {};
  const stockAlerts = criticalStock?.data || [];
  const overdueList = overdueClients?.data || [];

  const stats = [
    {
      title: 'Ventas del Día',
      value: `$${kpiData.dailySales?.toLocaleString() || '0'}`,
      change: kpiData.dailySalesChange || 0,
      icon: DollarSign,
      color: 'bg-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Ventas del Mes',
      value: `$${kpiData.monthlySales?.toLocaleString() || '0'}`,
      change: kpiData.monthlySalesChange || 0,
      icon: TrendingUp,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Productos Críticos',
      value: stockAlerts.length,
      icon: AlertTriangle,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      textColor: 'text-orange-600 dark:text-orange-400',
      alert: stockAlerts.length > 0,
    },
    {
      title: 'Pagos Pendientes',
      value: `$${kpiData.pendingPayments?.toLocaleString() || '0'}`,
      icon: Users,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      textColor: 'text-purple-600 dark:text-purple-400',
      alert: overdueList.length > 0,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Resumen general del sistema
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.change > 0;
          
          return (
            <div
              key={stat.title}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 
                border border-gray-200 dark:border-gray-700
                hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <Icon className={`w-6 h-6 ${stat.textColor}`} />
                </div>
                {stat.change !== undefined && (
                  <div className={`flex items-center space-x-1 text-sm ${
                    isPositive ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span>{Math.abs(stat.change)}%</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {stat.title}
                </p>
                <p className={`text-2xl font-bold ${stat.textColor}`}>
                  {stat.value}
                </p>
              </div>
              {stat.alert && (
                <div className="mt-3 flex items-center text-xs text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  <span>Requiere atención</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Alerts */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 
          border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Alertas de Stock
            </h2>
            <Link 
              to="/products"
              className="text-sm text-green-600 hover:text-green-700 dark:text-green-400"
            >
              Ver todos
            </Link>
          </div>
          
          {stockAlerts.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No hay productos con stock crítico
            </p>
          ) : (
            <div className="space-y-3">
              {stockAlerts.slice(0, 5).map((product) => (
                <div 
                  key={product.id}
                  className="flex items-center justify-between p-3 rounded-lg
                    bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {product.nombre}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Stock: {product.stock_actual} {product.unidad_medida}
                    </p>
                  </div>
                  <div className="ml-3">
                    <span className="px-2 py-1 text-xs font-medium rounded-full
                      bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400">
                      Crítico
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Payments */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 
          border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Pagos Vencidos
            </h2>
            <Link 
              to="/clients"
              className="text-sm text-green-600 hover:text-green-700 dark:text-green-400"
            >
              Ver todos
            </Link>
          </div>
          
          {overdueList.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No hay pagos vencidos
            </p>
          ) : (
            <div className="space-y-3">
              {overdueList.slice(0, 5).map((client) => (
                <div 
                  key={client.id}
                  className="flex items-center justify-between p-3 rounded-lg
                    bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {client.razon_social}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Deuda: ${client.saldo_pendiente?.toLocaleString()}
                    </p>
                  </div>
                  <div className="ml-3">
                    <span className="px-2 py-1 text-xs font-medium rounded-full
                      bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">
                      Vencido
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 
        border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/pos"
            className="flex flex-col items-center p-4 rounded-lg
              bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30
              border border-green-200 dark:border-green-800 transition-colors"
          >
            <DollarSign className="w-8 h-8 text-green-600 dark:text-green-400 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Nueva Venta
            </span>
          </Link>
          
          <Link
            to="/products"
            className="flex flex-col items-center p-4 rounded-lg
              bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30
              border border-blue-200 dark:border-blue-800 transition-colors"
          >
            <Package className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Productos
            </span>
          </Link>
          
          <Link
            to="/clients"
            className="flex flex-col items-center p-4 rounded-lg
              bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30
              border border-purple-200 dark:border-purple-800 transition-colors"
          >
            <Users className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Clientes
            </span>
          </Link>
          
          <Link
            to="/reports"
            className="flex flex-col items-center p-4 rounded-lg
              bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30
              border border-orange-200 dark:border-orange-800 transition-colors"
          >
            <TrendingUp className="w-8 h-8 text-orange-600 dark:text-orange-400 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Reportes
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
