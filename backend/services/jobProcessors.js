/**
 * Background Job Processors
 * Handlers for async background tasks
 */
import logger from '../utils/logger.js';
import jobQueueManager from '../utils/jobQueue.js';
import { pool } from '../database/connection.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Generate receipt PDF
 */
const generateReceiptPDF = async (job) => {
  const { saleId, outputPath } = job.data;
  
  try {
    // Get sale data
    const saleResult = await pool.query(
      `SELECT 
        v.*,
        c.nombre as cliente_nombre,
        c.cuit as cliente_cuit,
        c.domicilio_fiscal as cliente_domicilio,
        u.nombre || ' ' || u.apellido as vendedor_nombre
       FROM ventas v
       JOIN clientes c ON v.cliente_id = c.id
       JOIN usuarios u ON v.usuario_id = u.id
       WHERE v.id = $1`,
      [saleId]
    );

    if (saleResult.rows.length === 0) {
      throw new Error(`Sale ${saleId} not found`);
    }

    const sale = saleResult.rows[0];

    // Get sale details
    const detailsResult = await pool.query(
      `SELECT 
        vd.*,
        p.codigo as producto_codigo,
        p.nombre as producto_nombre,
        p.unidad_medida
       FROM ventas_detalle vd
       JOIN productos p ON vd.producto_id = p.id
       WHERE vd.venta_id = $1
       ORDER BY vd.created_at`,
      [saleId]
    );

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const pdfPath = outputPath || `/tmp/receipt-${saleId}.pdf`;
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text('SOL & VERDE', { align: 'center' });
    doc.fontSize(10).text('Sistema POS Mayorista', { align: 'center' });
    doc.moveDown();

    // Receipt info
    doc.fontSize(14).text(`Comprobante ${sale.tipo_comprobante} - #${sale.numero_venta}`);
    doc.fontSize(10);
    doc.text(`Fecha: ${new Date(sale.fecha).toLocaleString('es-AR')}`);
    doc.text(`Vendedor: ${sale.vendedor_nombre}`);
    doc.moveDown();

    // Client info
    doc.fontSize(12).text('Cliente:', { underline: true });
    doc.fontSize(10);
    doc.text(sale.cliente_nombre);
    if (sale.cliente_cuit) doc.text(`CUIT: ${sale.cliente_cuit}`);
    if (sale.cliente_domicilio) doc.text(sale.cliente_domicilio);
    doc.moveDown();

    // Items table
    doc.fontSize(12).text('Detalle:', { underline: true });
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const itemX = 50;
    const qtyX = 300;
    const priceX = 370;
    const totalX = 470;

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Producto', itemX, tableTop);
    doc.text('Cant.', qtyX, tableTop);
    doc.text('Precio', priceX, tableTop);
    doc.text('Subtotal', totalX, tableTop);
    
    doc.moveTo(itemX, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Table rows
    doc.font('Helvetica');
    let y = tableTop + 20;
    
    for (const item of detailsResult.rows) {
      doc.text(item.producto_nombre, itemX, y, { width: 240 });
      doc.text(item.cantidad.toString(), qtyX, y);
      doc.text(`$${parseFloat(item.precio_unitario).toFixed(2)}`, priceX, y);
      doc.text(`$${parseFloat(item.subtotal).toFixed(2)}`, totalX, y);
      y += 20;
      
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    doc.moveDown();

    // Totals
    const totalsX = 400;
    doc.font('Helvetica');
    doc.text('Subtotal:', totalsX, y);
    doc.text(`$${parseFloat(sale.subtotal).toFixed(2)}`, totalX, y);
    y += 15;

    if (sale.descuento > 0) {
      doc.text('Descuento:', totalsX, y);
      doc.text(`-$${parseFloat(sale.descuento).toFixed(2)}`, totalX, y);
      y += 15;
    }

    doc.text('IVA:', totalsX, y);
    doc.text(`$${parseFloat(sale.iva).toFixed(2)}`, totalX, y);
    y += 15;

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL:', totalsX, y);
    doc.text(`$${parseFloat(sale.total).toFixed(2)}`, totalX, y);

    // Footer
    if (sale.observaciones) {
      doc.moveDown();
      doc.fontSize(9).font('Helvetica');
      doc.text(`Observaciones: ${sale.observaciones}`);
    }

    doc.end();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    logger.info(`Receipt PDF generated: ${pdfPath}`);
    
    return { success: true, path: pdfPath };
  } catch (error) {
    logger.error('Error generating receipt PDF:', error);
    throw error;
  }
};

/**
 * Generate sales report
 */
const generateSalesReport = async (job) => {
  const { startDate, endDate, format, outputPath } = job.data;
  
  try {
    const result = await pool.query(
      `SELECT 
        v.*,
        c.nombre as cliente_nombre,
        u.nombre || ' ' || u.apellido as vendedor_nombre
       FROM ventas v
       JOIN clientes c ON v.cliente_id = c.id
       JOIN usuarios u ON v.usuario_id = u.id
       WHERE v.fecha BETWEEN $1 AND $2
       AND v.estado = 'completada'
       ORDER BY v.fecha DESC`,
      [startDate, endDate]
    );

    if (format === 'pdf') {
      // Generate PDF report
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const pdfPath = outputPath || `/tmp/sales-report-${Date.now()}.pdf`;
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      doc.fontSize(16).text('Reporte de Ventas', { align: 'center' });
      doc.fontSize(10).text(`Período: ${startDate} a ${endDate}`, { align: 'center' });
      doc.moveDown();

      let total = 0;
      for (const sale of result.rows) {
        doc.fontSize(9);
        doc.text(`#${sale.numero_venta} - ${sale.cliente_nombre} - $${sale.total}`);
        total += parseFloat(sale.total);
      }

      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Total: $${total.toFixed(2)}`);

      doc.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      logger.info(`Sales report PDF generated: ${pdfPath}`);
      return { success: true, path: pdfPath, recordCount: result.rows.length };
    } else {
      // Return JSON data
      return { success: true, data: result.rows, recordCount: result.rows.length };
    }
  } catch (error) {
    logger.error('Error generating sales report:', error);
    throw error;
  }
};

/**
 * Send email notification
 */
const sendEmailNotification = async (job) => {
  const { to, subject, body, attachments } = job.data;
  
  // TODO: Implement actual email sending using nodemailer
  logger.info(`Email would be sent to ${to}: ${subject}`);
  
  return { success: true, to, subject };
};

/**
 * Cleanup old data
 */
const cleanupOldData = async (job) => {
  const { type, olderThan } = job.data;
  
  try {
    let result;
    
    if (type === 'audit_logs') {
      result = await pool.query(
        'DELETE FROM auditoria WHERE fecha < $1',
        [olderThan]
      );
    } else if (type === 'expired_reservations') {
      result = await pool.query(
        'DELETE FROM stock_reservations WHERE expires_at < CURRENT_TIMESTAMP'
      );
    }

    logger.info(`Cleanup completed: ${result.rowCount} records deleted`);
    return { success: true, deletedCount: result.rowCount };
  } catch (error) {
    logger.error('Error during cleanup:', error);
    throw error;
  }
};

/**
 * Initialize job processors
 */
export const initializeJobProcessors = () => {
  // Receipt generation
  jobQueueManager.processJob('receipts', 'generate-pdf', generateReceiptPDF, 2);

  // Report generation
  jobQueueManager.processJob('reports', 'sales-report', generateSalesReport, 1);

  // Email notifications
  jobQueueManager.processJob('emails', 'send-notification', sendEmailNotification, 3);

  // Cleanup tasks
  jobQueueManager.processJob('cleanup', 'cleanup-old-data', cleanupOldData, 1);

  logger.info('✓ Job processors initialized');
};

export default {
  generateReceiptPDF,
  generateSalesReport,
  sendEmailNotification,
  cleanupOldData,
  initializeJobProcessors,
};
