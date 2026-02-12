import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Wallet, 
  LogIn, 
  LogOut, 
  DollarSign, 
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cajaAPI } from '../services/api';

const CashRegister = () => {
  const queryClient = useQueryClient();
  const [openingAmount, setOpeningAmount] = useState('');
  const [movementType, setMovementType] = useState('ingreso');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDescription, setMovementDescription] = useState('');

  const { data: currentShift, isLoading } = useQuery({
    queryKey: ['current-shift'],
    queryFn: cajaAPI.getCurrent,
  });

  const openShiftMutation = useMutation({
    mutationFn: cajaAPI.openShift,
    onSuccess: () => {
      queryClient.invalidateQueries(['current-shift']);
      setOpeningAmount('');
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: cajaAPI.closeShift,
    onSuccess: () => {
      queryClient.invalidateQueries(['current-shift']);
    },
  });

  const addMovementMutation = useMutation({
    mutationFn: cajaAPI.addMovement,
    onSuccess: () => {
      queryClient.invalidateQueries(['current-shift']);
      setMovementAmount('');
      setMovementDescription('');
    },
  });

  const handleOpenShift = (e) => {
    e.preventDefault();
    openShiftMutation.mutate({
      monto_apertura: parseFloat(openingAmount),
    });
  };

  const handleCloseShift = () => {
    if (window.confirm('¿Está seguro de cerrar el turno de caja?')) {
      closeShiftMutation.mutate({
        turno_id: currentShift.data.id,
      });
    }
  };

  const handleAddMovement = (e) => {
    e.preventDefault();
    addMovementMutation.mutate({
      tipo: movementType,
      monto: parseFloat(movementAmount),
      descripcion: movementDescription,
    });
  };

  const shift = currentShift?.data;
  const isOpen = shift && !shift.fecha_cierre;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Caja</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Gestión de caja y turnos
        </p>
      </div>

      {!isOpen ? (
        /* Open Shift Form */
        <div className="max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 
            border border-gray-200 dark:border-gray-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full 
                flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Abrir Turno de Caja
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Ingrese el monto inicial de efectivo
              </p>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Monto de Apertura
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={openShiftMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400
                  text-white font-semibold py-3 px-4 rounded-lg
                  flex items-center justify-center space-x-2 transition-colors"
              >
                {openShiftMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Abriendo...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>Abrir Caja</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Active Shift Dashboard */
        <div className="space-y-6">
          {/* Current Shift Info */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 
            rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Turno Activo
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Abierto: {new Date(shift.fecha_apertura).toLocaleString('es-AR')}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseShift}
                disabled={closeShiftMutation.isPending}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 
                  text-white px-4 py-2 rounded-lg transition-colors disabled:bg-gray-400"
              >
                <LogOut className="w-5 h-5" />
                <span>Cerrar Turno</span>
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Apertura
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  ${shift.monto_apertura?.toFixed(2)}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Ingresos
                </p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  +${shift.total_ingresos?.toFixed(2) || '0.00'}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Egresos
                </p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  -${shift.total_egresos?.toFixed(2) || '0.00'}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Saldo Actual
                </p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  ${((shift.monto_apertura || 0) + (shift.total_ingresos || 0) - (shift.total_egresos || 0)).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Add Movement */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 
            border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Registrar Movimiento
            </h3>

            <form onSubmit={handleAddMovement} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tipo
                  </label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monto
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={movementAmount}
                      onChange={(e) => setMovementAmount(e.target.value)}
                      className="w-full pl-8 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    &nbsp;
                  </label>
                  <button
                    type="submit"
                    disabled={addMovementMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400
                      text-white font-semibold py-2 px-4 rounded-lg transition-colors
                      flex items-center justify-center space-x-2"
                  >
                    {addMovementMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <DollarSign className="w-5 h-5" />
                        <span>Registrar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Descripción
                </label>
                <input
                  type="text"
                  required
                  value={movementDescription}
                  onChange={(e) => setMovementDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Motivo del movimiento"
                />
              </div>
            </form>
          </div>

          {/* Recent Movements */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 
            border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Últimos Movimientos
            </h3>

            <div className="space-y-3">
              {shift.movimientos?.slice(0, 10).map((mov, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg
                    bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      mov.tipo === 'ingreso' 
                        ? 'bg-green-100 dark:bg-green-900/30' 
                        : 'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      {mov.tipo === 'ingreso' ? (
                        <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {mov.descripcion}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(mov.fecha).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                  <p className={`text-lg font-bold ${
                    mov.tipo === 'ingreso' 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {mov.tipo === 'ingreso' ? '+' : '-'}${mov.monto?.toFixed(2)}
                  </p>
                </div>
              ))}

              {(!shift.movimientos || shift.movimientos.length === 0) && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No hay movimientos registrados
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashRegister;
