/**
 * Export Service
 * Handles PDF and Excel exports for reports
 */
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

// PDF Configuration Constants
const PDF_CONFIG = {
  PAGE_SIZE: 'A4',
  LAYOUT: 'landscape',
  MARGIN: 50,
  HEADER_FONT_SIZE: 18,
  SUBHEADER_FONT_SIZE: 10,
  TABLE_HEADER_FONT_SIZE: 9,
  TABLE_ROW_FONT_SIZE: 8,
  TOTALS_FONT_SIZE: 10,
  FOOTER_FONT_SIZE: 8,
};

/**
 * Generate PDF report
 * @param {Object} options - Report options
 * @param {String} options.title - Report title
 * @param {Array} options.data - Report data
 * @param {Array} options.columns - Column definitions [{key, header, width}]
 * @param {Object} options.totals - Totals object
 * @param {String} options.filename - Output filename
 * @returns {Promise<String>} Path to generated PDF
 */
export const generatePDFReport = async (options) => {
  const {
    title,
    data,
    columns,
    totals,
    filename = `report-${Date.now()}.pdf`,
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const outputPath = path.join('/tmp', filename);
      const doc = new PDFDocument({ 
        size: PDF_CONFIG.PAGE_SIZE, 
        margin: PDF_CONFIG.MARGIN, 
        layout: PDF_CONFIG.LAYOUT 
      });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(PDF_CONFIG.HEADER_FONT_SIZE).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.fontSize(PDF_CONFIG.SUBHEADER_FONT_SIZE).font('Helvetica').text(`Generado: ${new Date().toLocaleString('es-AR')}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      const tableTop = doc.y;
      const startX = PDF_CONFIG.MARGIN;
      let currentX = startX;

      doc.fontSize(PDF_CONFIG.TABLE_HEADER_FONT_SIZE).font('Helvetica-Bold');
      columns.forEach(col => {
        doc.text(col.header, currentX, tableTop, { width: col.width, continued: false });
        currentX += col.width;
      });

      doc.moveTo(startX, tableTop + 15).lineTo(startX + columns.reduce((sum, col) => sum + col.width, 0), tableTop + 15).stroke();

      // Table rows
      let y = tableTop + 20;
      doc.font('Helvetica').fontSize(PDF_CONFIG.TABLE_ROW_FONT_SIZE);

      data.forEach((row, index) => {
        if (y > 500) {
          doc.addPage();
          y = 50;
        }

        currentX = startX;
        columns.forEach(col => {
          const value = row[col.key] !== undefined && row[col.key] !== null ? 
            (typeof row[col.key] === 'number' ? 
              col.format === 'currency' ? `$${parseFloat(row[col.key]).toFixed(2)}` : row[col.key].toString() 
              : row[col.key].toString()) 
            : '';
          doc.text(value, currentX, y, { width: col.width, continued: false });
          currentX += col.width;
        });
        
        y += 15;
      });

      // Totals
      if (totals) {
        doc.moveDown();
        y = doc.y + 20;
        doc.fontSize(PDF_CONFIG.TOTALS_FONT_SIZE).font('Helvetica-Bold');
        
        Object.keys(totals).forEach(key => {
          const label = key.replace(/_/g, ' ').toUpperCase();
          const value = typeof totals[key] === 'number' ? 
            `$${parseFloat(totals[key]).toFixed(2)}` : 
            totals[key].toString();
          
          doc.text(`${label}: ${value}`, startX, y);
          y += 15;
        });
      }

      // Footer
      doc.fontSize(PDF_CONFIG.FOOTER_FONT_SIZE).font('Helvetica').text(
        'Sol & Verde POS - Sistema de Gestión',
        startX,
        doc.page.height - PDF_CONFIG.MARGIN,
        { align: 'center' }
      );

      doc.end();

      stream.on('finish', () => {
        logger.info(`PDF report generated: ${outputPath}`);
        resolve(outputPath);
      });

      stream.on('error', reject);
    } catch (error) {
      logger.error('Error generating PDF report:', error);
      reject(error);
    }
  });
};

/**
 * Generate Excel report
 * @param {Object} options - Report options
 * @param {String} options.title - Report title
 * @param {Array} options.data - Report data
 * @param {Array} options.columns - Column definitions [{key, header, width}]
 * @param {Object} options.totals - Totals object
 * @param {String} options.filename - Output filename
 * @returns {Promise<String>} Path to generated Excel file
 */
export const generateExcelReport = async (options) => {
  const {
    title,
    data,
    columns,
    totals,
    filename = `report-${Date.now()}.xlsx`,
  } = options;

  try {
    const outputPath = path.join('/tmp', filename);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(title);

    // Set column definitions
    worksheet.columns = columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width / 7, // Convert PDF width to Excel width
    }));

    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    data.forEach(row => {
      const excelRow = worksheet.addRow(row);
      
      // Format currency columns
      columns.forEach((col, index) => {
        if (col.format === 'currency' && row[col.key] !== undefined) {
          excelRow.getCell(index + 1).numFmt = '$#,##0.00';
        }
      });
    });

    // Add totals
    if (totals) {
      worksheet.addRow({}); // Empty row
      Object.keys(totals).forEach(key => {
        const label = key.replace(/_/g, ' ').toUpperCase();
        const row = worksheet.addRow({ [columns[0].key]: label, [columns[1].key]: totals[key] });
        row.font = { bold: true };
      });
    }

    // Auto-filter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    // Freeze header row
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    await workbook.xlsx.writeFile(outputPath);
    logger.info(`Excel report generated: ${outputPath}`);
    
    return outputPath;
  } catch (error) {
    logger.error('Error generating Excel report:', error);
    throw error;
  }
};

/**
 * Stream PDF to response
 * @param {String} filepath - Path to PDF file
 * @param {Object} res - Express response object
 */
export const streamPDF = (filepath, res) => {
  const filename = path.basename(filepath);
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  const stream = fs.createReadStream(filepath);
  
  // Cleanup function
  const cleanup = () => {
    fs.unlink(filepath, (err) => {
      if (err) logger.error('Error deleting temp PDF:', err);
    });
  };
  
  stream.pipe(res);
  
  stream.on('end', cleanup);
  stream.on('error', (err) => {
    logger.error('Error streaming PDF:', err);
    cleanup();
  });
  
  res.on('close', cleanup);
  res.on('error', cleanup);
};

/**
 * Stream Excel to response
 * @param {String} filepath - Path to Excel file
 * @param {Object} res - Express response object
 */
export const streamExcel = (filepath, res) => {
  const filename = path.basename(filepath);
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  const stream = fs.createReadStream(filepath);
  
  // Cleanup function
  const cleanup = () => {
    fs.unlink(filepath, (err) => {
      if (err) logger.error('Error deleting temp Excel:', err);
    });
  };
  
  stream.pipe(res);
  
  stream.on('end', cleanup);
  stream.on('error', (err) => {
    logger.error('Error streaming Excel:', err);
    cleanup();
  });
  
  res.on('close', cleanup);
  res.on('error', cleanup);
};

export default {
  generatePDFReport,
  generateExcelReport,
  streamPDF,
  streamExcel,
};
