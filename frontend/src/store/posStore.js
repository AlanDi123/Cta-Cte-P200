import { create } from 'zustand';

const usePOSStore = create((set, get) => ({
  // Cart items
  items: [],
  
  // Selected client
  client: null,
  
  // Payment details
  paymentType: 'contado', // contado, credito, parcial
  paymentMethod: 'efectivo', // efectivo, tarjeta, cheque, transferencia
  paymentAmount: 0,
  
  // Discount
  globalDiscount: 0,
  
  // Add item to cart
  addItem: (product, quantity = 1) => {
    const items = get().items;
    const existingIndex = items.findIndex(item => item.producto_id === product.id);
    
    if (existingIndex >= 0) {
      const newItems = [...items];
      newItems[existingIndex].cantidad += quantity;
      newItems[existingIndex].subtotal = newItems[existingIndex].cantidad * newItems[existingIndex].precio_unitario;
      set({ items: newItems });
    } else {
      const newItem = {
        producto_id: product.id,
        codigo: product.codigo,
        nombre: product.nombre,
        cantidad: quantity,
        precio_unitario: product.precio_venta,
        descuento_porcentaje: 0,
        subtotal: quantity * product.precio_venta,
        iva_porcentaje: product.iva_porcentaje || 21,
        unidad_medida: product.unidad_medida,
      };
      set({ items: [...items, newItem] });
    }
  },
  
  // Update item quantity
  updateItemQuantity: (productId, quantity) => {
    const items = get().items;
    const newItems = items.map(item => {
      if (item.producto_id === productId) {
        return {
          ...item,
          cantidad: quantity,
          subtotal: quantity * item.precio_unitario * (1 - item.descuento_porcentaje / 100),
        };
      }
      return item;
    });
    set({ items: newItems });
  },
  
  // Update item discount
  updateItemDiscount: (productId, discount) => {
    const items = get().items;
    const newItems = items.map(item => {
      if (item.producto_id === productId) {
        return {
          ...item,
          descuento_porcentaje: discount,
          subtotal: item.cantidad * item.precio_unitario * (1 - discount / 100),
        };
      }
      return item;
    });
    set({ items: newItems });
  },
  
  // Remove item from cart
  removeItem: (productId) => {
    set({ items: get().items.filter(item => item.producto_id !== productId) });
  },
  
  // Clear cart
  clearCart: () => {
    set({ 
      items: [], 
      client: null, 
      globalDiscount: 0,
      paymentType: 'contado',
      paymentMethod: 'efectivo',
      paymentAmount: 0,
    });
  },
  
  // Set client
  setClient: (client) => {
    set({ client });
    // Apply client discount if exists
    if (client?.descuento_porcentaje) {
      set({ globalDiscount: client.descuento_porcentaje });
    }
  },
  
  // Set payment type
  setPaymentType: (type) => {
    set({ paymentType: type });
  },
  
  // Set payment method
  setPaymentMethod: (method) => {
    set({ paymentMethod: method });
  },
  
  // Set payment amount (for parcial type)
  setPaymentAmount: (amount) => {
    set({ paymentAmount: amount });
  },
  
  // Set global discount
  setGlobalDiscount: (discount) => {
    set({ globalDiscount: discount });
  },
  
  // Calculate totals
  getTotals: () => {
    const { items, globalDiscount } = get();
    
    let subtotal = 0;
    
    items.forEach(item => {
      const itemSubtotal = item.cantidad * item.precio_unitario;
      const itemDiscount = itemSubtotal * (item.descuento_porcentaje / 100);
      const itemTotal = itemSubtotal - itemDiscount;
      
      subtotal += itemTotal;
    });
    
    // Apply global discount
    const discountAmount = subtotal * (globalDiscount / 100);
    const discountedSubtotal = subtotal - discountAmount;
    
    // Recalculate IVA proportionally after global discount
    const ivaAfterDiscount = items.reduce((sum, item) => {
      const itemSubtotal = item.cantidad * item.precio_unitario;
      const itemDiscount = itemSubtotal * (item.descuento_porcentaje / 100);
      const itemTotal = itemSubtotal - itemDiscount;
      const itemProportion = itemTotal / subtotal;
      const itemDiscountedTotal = discountedSubtotal * itemProportion;
      return sum + (itemDiscountedTotal * (item.iva_porcentaje / 100));
    }, 0);
    
    const total = discountedSubtotal + ivaAfterDiscount;
    
    return {
      subtotal: discountedSubtotal.toFixed(2),
      totalIVA: ivaAfterDiscount.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      total: total.toFixed(2),
      itemCount: items.reduce((sum, item) => sum + item.cantidad, 0),
    };
  },
  
  // Prepare sale data for API
  prepareSaleData: () => {
    const { items, client, paymentType, paymentMethod, paymentAmount } = get();
    const totals = get().getTotals();
    
    const saleData = {
      cliente_id: client?.id || null,
      tipo_venta: paymentType,
      items: items.map(item => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento_porcentaje: item.descuento_porcentaje,
        iva_porcentaje: item.iva_porcentaje,
      })),
      medio_pago: paymentMethod,
      monto_total: parseFloat(totals.total),
    };
    
    // Add payment amount for parcial sales
    if (paymentType === 'parcial' && paymentAmount > 0) {
      saleData.monto_pagado = paymentAmount;
    }
    
    return saleData;
  },
}));

export default usePOSStore;
