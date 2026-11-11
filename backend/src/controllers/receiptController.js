const PDFDocument = require('pdfkit');
const Transaction = require('../models/Transaction');
const { formatCurrency } = require('../utils/helpers');
const logger = require('../utils/logger');

exports.generateReceipt = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
    }).populate('sender', 'name email accountNumber')
      .populate('recipient', 'name email accountNumber');

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Comprovante - ${transaction.transactionRef}`,
        Author: 'MeuBanco GW',
        Subject: 'Comprovante de Transação',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comprovante-${transaction.transactionRef}.pdf`);
    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(24).font('Helvetica-Bold').text('MeuBanco GW', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Sistema de Pagamentos - Guiné-Bissau', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).font('Helvetica-Bold').text('COMPROVANTE DE TRANSAÇÃO', { align: 'center' });
    doc.moveDown();

    // Linha divisória
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Status
    const statusColors = {
      completed: '#22c55e',
      pending: '#f59e0b',
      failed: '#ef4444',
      processing: '#3b82f6',
    };
    doc.fontSize(12).font('Helvetica-Bold')
      .fillColor(statusColors[transaction.status] || '#000')
      .text(`Status: ${transaction.status.toUpperCase()}`, { align: 'center' })
      .fillColor('#000');
    doc.moveDown();

    // Detalhes
    const leftX = 50;
    const rightX = 300;
    let y = doc.y;

    const addField = (label, value, x, yPos) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666').text(label, x, yPos);
      doc.fontSize(10).font('Helvetica').fillColor('#000').text(String(value || '-'), x, yPos + 12);
      return yPos + 35;
    };

    doc.fontSize(14).font('Helvetica-Bold').text('Detalhes da Transação', leftX, y);
    y += 25;

    y = addField('Referência', transaction.transactionRef, leftX, y);
    y = addField('Tipo', transaction.type.replace(/_/g, ' '), rightX, y - 35);
    y = addField('Método de Pagamento', transaction.paymentMethod.replace(/_/g, ' ').toUpperCase(), leftX, y);
    y = addField('Categoria', transaction.category || 'Outros', rightX, y - 35);
    y = addField('Data', new Date(transaction.createdAt).toLocaleString('pt-BR'), leftX, y);
    y = addField('Descrição', transaction.description || '-', rightX, y - 35);

    y += 10;
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 20;

    doc.fontSize(14).font('Helvetica-Bold').text('Partes Envolvidas', leftX, y);
    y += 25;

    y = addField('Remetente', transaction.sender?.name || '-', leftX, y);
    y = addField('Conta', transaction.sender?.accountNumber || '-', leftX, y);
    y = addField('Email', transaction.sender?.email || '-', leftX, y);
    y = addField('Destinatário', transaction.recipient?.name || transaction.recipientName || '-', rightX, y - 105);
    y = addField('Conta Destino', transaction.recipient?.accountNumber || transaction.recipientAccount || '-', rightX, y - 35);
    y = addField('Email Destino', transaction.recipient?.email || '-', rightX, y - 35);

    y += 10;
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 20;

    // Valores
    doc.fontSize(14).font('Helvetica-Bold').text('Valores', leftX, y);
    y += 25;

    y = addField('Valor', formatCurrency(transaction.amount, transaction.currency), leftX, y);
    if (transaction.originalCurrency && transaction.originalCurrency !== transaction.currency) {
      y = addField(
        'Valor original / câmbio',
        `${formatCurrency(transaction.originalAmount, transaction.originalCurrency)} × ${transaction.exchangeRate}`,
        leftX,
        y,
      );
    }
    y = addField('Taxa', formatCurrency(transaction.fee || 0, transaction.currency), leftX, y);
    doc.fontSize(12).font('Helvetica-Bold')
      .text(`Total: ${formatCurrency(transaction.totalAmount || transaction.amount, transaction.currency)}`, leftX, y + 10);
    y += 40;

    // Rodapé
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 15;
    doc.fontSize(8).font('Helvetica').fillColor('#999').text(
      'Este comprovante é válido para todos os fins legais.\n' +
      'MeuBanco GW - Soluções Financeiras para Guiné-Bissau\n' +
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      leftX, y, { align: 'center' }
    );

    // QR Code simplificado
    doc.fontSize(8).text(`QR: ${transaction.transactionRef}`, leftX, y + 40, { align: 'center' });

    doc.end();

    transaction.receiptGenerated = true;
    await transaction.save();
  } catch (error) {
    logger.error('Erro ao gerar PDF:', error);
    res.status(500).json({ error: 'Erro ao gerar comprovante' });
  }
};
