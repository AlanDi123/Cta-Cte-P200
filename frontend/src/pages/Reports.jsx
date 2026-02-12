import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  Download, 
  Calendar,
  DollarSign,
  Package,
  Users,
  TrendingUp,
  FileText,
  Loader2
} from 'lucide-react';
import { reportsAPI } from '../services/api';

const Reports = () => {
  const [reportType, setReportType] = useState('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', reportType, dateFrom, dateTo],
    queryFn: () => {
      const params = { fecha_desde: dateFrom, fecha_hasta: dateTo };
      switch (reportType) {
        case 'sales':
          return reportsAPI.sales(params);
        case 'cash':
          return reportsAPI.cash(params);
        case 'stock':
          return reportsAPI.stock(params);
        case 'clients':
          return reportsAPI.clients(params);
        default:
          return reportsAPI.sales(params);
      }
    },
    enabled: !!dateFrom && !!dateTo,
  });

  const reportTypes = [
    {
      id: 'sales',
      name: 'Ventas',
      icon: DollarSign,
      color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    },
    {
      id: 'cash',
      name: 'Caja',
      icon: TrendingUp,
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    },
    {
      id: 'stock',
      name: 'Stock',
      icon: Package,
      color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    },
    {
      id: 'clients',
      name: 'Clientes',
      icon: Users,
      color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    },
  ];

  const handleExport = () => {
    // TODO: Implement export functionality
    alert('Exportar reporte a PDF/Excel');
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reportes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Análisis y reportes del sistema
          </p>
        </div>
        {data && (
          <button
            onClick={handleExport}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 
              text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Exportar</span>
          </button>
        )}
      </div>

      {/* Report Type Selection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {reportTypes.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => setReportType(type.id)}
              className={`p-6 rounded-xl border-2 transition-all ${
                reportType === type.id
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-green-300'
              }`}
            >
              <div className={`${type.color} w-12 h-12 rounded-lg flex items-center justify-center mb-3`}>
                <Icon className="w-6 h-6" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {type.name}
              </p>
            </button>
          );
        })}
      </div>

      {/* Date Range Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6 
        border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fecha Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0];
                setDateFrom(lastMonth);
                setDateTo(today);
              }}
              className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition-colors"
            >
              Últimos 30 días
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 
        border border-gray-200 dark:border-gray-700">
        {!dateFrom || !dateTo ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              Seleccione un rango de fechas para generar el reporte
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 
                rounded-lg p-6 border border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-3 mb-2">
                  <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                  <p className="text-sm font-medium text-green-900 dark:text-green-200">
                    Total Ventas
                  </p>
                </div>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  ${data.data?.total_ventas?.toFixed(2) || '0.00'}
                </p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 
                rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center space-x-3 mb-2">
                  <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Cantidad
                  </p>
                </div>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {data.data?.cantidad_ventas || 0}
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10 
                rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                <div className="flex items-center space-x-3 mb-2">
                  <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  <p className="text-sm font-medium text-purple-900 dark:text-purple-200">
                    Promedio
                  </p>
                </div>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  ${data.data?.promedio?.toFixed(2) || '0.00'}
                </p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/10 
                rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center space-x-3 mb-2">
                  <FileText className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                    Período
                  </p>
                </div>
                <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                  {new Date(dateFrom).toLocaleDateString('es-AR')} - {new Date(dateTo).toLocaleDateString('es-AR')}
                </p>
              </div>
            </div>

            {/* Chart Placeholder */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-8 border-2 border-dashed 
              border-gray-300 dark:border-gray-600">
              <div className="text-center">
                <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">
                  Gráfico de {reportTypes.find(t => t.id === reportType)?.name}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                  Los gráficos se implementarán con Chart.js o Recharts
                </p>
              </div>
            </div>

            {/* Data Table Placeholder */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Detalle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Cantidad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.data?.items?.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4 text-gray-900 dark:text-white">
                        {item.descripcion}
                      </td>
                      <td className="px-6 py-4 text-gray-900 dark:text-white">
                        {item.cantidad}
                      </td>
                      <td className="px-6 py-4 font-semibold text-green-600 dark:text-green-400">
                        ${item.monto?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              No hay datos disponibles para el período seleccionado
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
