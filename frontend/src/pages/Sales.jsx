import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  Receipt, 
  Calendar,
  DollarSign,
  User,
  Eye,
  Loader2,
  Filter
} from 'lucide-react';
import { salesAPI } from '../services/api';

const Sales = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tipoVenta, setTipoVenta] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sales', searchQuery, dateFrom, dateTo, tipoVenta],
    queryFn: () => salesAPI.getAll({ 
      search: searchQuery,
      fecha_desde: dateFrom,
      fecha_hasta: dateTo,
      tipo_venta: tipoVenta,
    }),
  });

  const sales = data?.data || [];

  const getTipoVentaBadge = (tipo) => {
    const badges = {
      contado: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      credito: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
      parcial: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    };
    return badges[tipo] || 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ventas</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Historial de ventas realizadas
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6 
        border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar ventas..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Desde"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Hasta"
          />

          <select
            value={tipoVenta}
            onChange={(e) => setTipoVenta(e.target.value)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">Todos los tipos</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
            <option value="parcial">Parcial</option>
          </select>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden
        border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              No se encontraron ventas
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    N° Venta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Medio Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      #{sale.id}
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white">
                      {new Date(sale.fecha_venta).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {sale.cliente_razon_social || 'Público General'}
                        </p>
                        {sale.vendedor_nombre && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Vendedor: {sale.vendedor_nombre}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getTipoVentaBadge(sale.tipo_venta)}`}>
                        {sale.tipo_venta}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white capitalize">
                      {sale.medio_pago}
                    </td>
                    <td className="px-6 py-4 font-bold text-green-600 dark:text-green-400">
                      ${sale.monto_total?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      {sale.anulada ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium
                          bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          Anulada
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-medium
                          bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          Completada
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        title="Ver detalle"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {sales.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 
            border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                <Receipt className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Ventas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {sales.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 
            border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Monto Total</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ${sales.reduce((sum, s) => sum + (s.monto_total || 0), 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 
            border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg">
                <User className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Promedio</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  ${sales.length > 0 ? (sales.reduce((sum, s) => sum + (s.monto_total || 0), 0) / sales.length).toFixed(2) : '0.00'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
