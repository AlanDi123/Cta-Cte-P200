import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, 
  Barcode, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  CreditCard,
  DollarSign,
  ShoppingCart,
  CheckCircle,
  XCircle,
  Loader2,
  X
} from 'lucide-react';
import usePOSStore from '../store/posStore';
import { productsAPI, clientsAPI, salesAPI } from '../services/api';

const POS = () => {
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  const {
    items,
    client,
    paymentType,
    paymentMethod,
    paymentAmount,
    addItem,
    updateItemQuantity,
    removeItem,
    setClient,
    setPaymentType,
    setPaymentMethod,
    setPaymentAmount,
    getTotals,
    prepareSaleData,
    clearCart,
  } = usePOSStore();

  const { data: productsData } = useQuery({
    queryKey: ['products', searchQuery],
    queryFn: () => productsAPI.getAll({ search: searchQuery, limit: 20 }),
    enabled: searchQuery.length >= 2,
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients', clientSearch],
    queryFn: () => clientsAPI.getAll({ search: clientSearch, limit: 10 }),
    enabled: showClientModal && clientSearch.length >= 2,
  });

  const completeSaleMutation = useMutation({
    mutationFn: salesAPI.create,
    onSuccess: (data) => {
      setLastSale(data.data);
      setShowSuccessModal(true);
      clearCart();
      queryClient.invalidateQueries(['sales']);
      queryClient.invalidateQueries(['dashboard-kpis']);
      setSearchQuery('');
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    },
  });

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  const handleBarcodeInput = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      searchProductByBarcode(searchQuery.trim());
    }
  };

  const searchProductByBarcode = async (barcode) => {
    try {
      const response = await productsAPI.getAll({ codigo: barcode });
      if (response.data && response.data.length > 0) {
        addItem(response.data[0]);
        setSearchQuery('');
      }
    } catch (error) {
      console.error('Error searching product:', error);
    }
  };

  const handleProductClick = (product) => {
    addItem(product);
    setSearchQuery('');
  };

  const handleClientSelect = (selectedClient) => {
    setClient(selectedClient);
    setShowClientModal(false);
    setClientSearch('');
  };

  const handleCompleteSale = () => {
    if (items.length === 0) return;
    
    const saleData = prepareSaleData();
    completeSaleMutation.mutate(saleData);
  };

  const totals = getTotals();
  const products = productsData?.data || [];
  const clients = clientsData?.data || [];

  return (
    <div className="h-full flex flex-col lg:flex-row bg-gray-50 dark:bg-gray-900">
      {/* Left Panel - Product Search */}
      <div className="lg:w-2/5 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 
        flex flex-col h-full overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <input
              ref={barcodeInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleBarcodeInput}
              placeholder="Buscar por código de barras o nombre..."
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-green-500 focus:border-transparent
                text-lg"
            />
            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* Product Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {searchQuery.length >= 2 ? (
            products.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className="flex items-center justify-between p-4 rounded-lg border
                      border-gray-200 dark:border-gray-700 hover:border-green-500
                      dark:hover:border-green-500 hover:shadow-md transition-all text-left
                      bg-white dark:bg-gray-700"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {product.nombre}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Código: {product.codigo}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Stock: {product.stock_actual} {product.unidad_medida}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-xl font-bold text-green-600 dark:text-green-400">
                        ${product.precio_venta}
                      </p>
                      <Plus className="w-5 h-5 text-green-600 dark:text-green-400 mx-auto mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  No se encontraron productos
                </p>
              </div>
            )
          ) : (
            <div className="text-center py-12">
              <Barcode className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                Escanee un código de barras o busque un producto
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Cart & Checkout */}
      <div className="lg:w-3/5 flex flex-col h-full">
        {/* Cart Header */}
        <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <ShoppingCart className="w-6 h-6 mr-2" />
              Carrito ({totals.itemCount} items)
            </h2>
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="text-red-600 hover:text-red-700 dark:text-red-400 text-sm flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Limpiar
              </button>
            )}
          </div>

          {/* Client Selection */}
          <div className="flex items-center space-x-2">
            {client ? (
              <div className="flex-1 flex items-center justify-between p-3 rounded-lg
                bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {client.razon_social}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {client.tipo_documento}: {client.numero_documento}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setClient(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClientModal(true)}
                className="flex-1 flex items-center justify-center space-x-2 p-3 rounded-lg
                  border-2 border-dashed border-gray-300 dark:border-gray-600
                  hover:border-green-500 dark:hover:border-green-500 transition-colors"
              >
                <User className="w-5 h-5 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">
                  Seleccionar Cliente (Opcional)
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  El carrito está vacío
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.producto_id}
                  className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {item.nombre}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        ${item.precio_unitario} x {item.cantidad}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.producto_id)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Quantity Controls */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => updateItemQuantity(item.producto_id, Math.max(0.01, item.cantidad - 1))}
                        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 
                          hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Minus className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      </button>
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => updateItemQuantity(item.producto_id, parseFloat(e.target.value) || 0.01)}
                        className="w-20 px-3 py-2 text-center rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        min="0.01"
                        step="0.01"
                      />
                      <button
                        onClick={() => updateItemQuantity(item.producto_id, item.cantidad + 1)}
                        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 
                          hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Plus className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      </button>
                    </div>

                    {/* Subtotal */}
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      ${item.subtotal.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout Panel */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
          {/* Payment Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipo de Pago
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'contado', label: 'Contado', icon: DollarSign },
                { value: 'credito', label: 'Crédito', icon: CreditCard },
                { value: 'parcial', label: 'Parcial', icon: CreditCard },
              ].map((paymentOption) => {
                const IconComponent = paymentOption.icon;
                return (
                <button
                  key={paymentOption.value}
                  onClick={() => setPaymentType(paymentOption.value)}
                  className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all
                    ${paymentType === paymentOption.value
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-green-300'
                    }`}
                >
                  <IconComponent className={`w-5 h-5 mb-1 ${
                    paymentType === paymentOption.value ? 'text-green-600 dark:text-green-400' : 'text-gray-500'
                  }`} />
                  <span className={`text-sm font-medium ${
                    paymentType === paymentOption.value ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {paymentOption.label}
                  </span>
                </button>
              );
              })}
            </div>
          </div>

          {/* Payment Method */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Medio de Pago
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          {/* Partial Payment Amount */}
          {paymentType === 'parcial' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Monto a Pagar
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Totals */}
          <div className="space-y-2 mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                ${totals.subtotal}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">IVA (21%)</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                ${totals.totalIVA}
              </span>
            </div>
            {parseFloat(totals.discountAmount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Descuento</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  -${totals.discountAmount}
                </span>
              </div>
            )}
            <div className="flex justify-between text-lg border-t border-gray-300 dark:border-gray-600 pt-2">
              <span className="font-bold text-gray-900 dark:text-white">Total</span>
              <span className="font-bold text-green-600 dark:text-green-400">
                ${totals.total}
              </span>
            </div>
          </div>

          {/* Complete Sale Button */}
          <button
            onClick={handleCompleteSale}
            disabled={items.length === 0 || completeSaleMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400
              text-white font-bold py-4 px-6 rounded-lg
              flex items-center justify-center space-x-2
              transition-colors duration-200 disabled:cursor-not-allowed
              text-lg"
          >
            {completeSaleMutation.isPending ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-6 h-6" />
                <span>Completar Venta</span>
              </>
            )}
          </button>

          {completeSaleMutation.isError && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 
              rounded-lg text-sm text-red-700 dark:text-red-400">
              Error al procesar la venta. Intente nuevamente.
            </div>
          )}
        </div>
      </div>

      {/* Client Selection Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] 
            flex flex-col shadow-2xl">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Seleccionar Cliente
                </h2>
                <button
                  onClick={() => {
                    setShowClientModal(false);
                    setClientSearch('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  autoFocus
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {clients.length > 0 ? (
                <div className="space-y-2">
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleClientSelect(c)}
                      className="w-full flex items-center justify-between p-4 rounded-lg
                        border border-gray-200 dark:border-gray-700 hover:border-green-500
                        dark:hover:border-green-500 hover:shadow-md transition-all text-left"
                    >
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {c.razon_social}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {c.tipo_documento}: {c.numero_documento}
                        </p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </button>
                  ))}
                </div>
              ) : clientSearch.length >= 2 ? (
                <p className="text-center text-gray-500 dark:text-gray-400">
                  No se encontraron clientes
                </p>
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400">
                  Busque un cliente por nombre o documento
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-8 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full 
                flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                ¡Venta Completada!
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                La venta se ha procesado exitosamente
              </p>
              {lastSale && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Venta N°
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    #{lastSale.id}
                  </p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    ${lastSale.monto_total?.toFixed(2)}
                  </p>
                </div>
              )}
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold 
                  py-3 px-6 rounded-lg transition-colors"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
