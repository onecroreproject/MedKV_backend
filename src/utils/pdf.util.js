const PDFDocument = require('pdfkit');
const path = require('path');

exports.generateReceiptPDF = (paymentData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header Background
      doc.rect(0, 0, doc.page.width, 110).fill('#0B1F4D');

      const logoPath = path.join(__dirname, '../assets/dark_logo_transparent.png');
      const companyNamePath = path.join(__dirname, '../assets/company_name_transparent.png');

      try {
        // Add images if they exist
        doc.image(logoPath, 50, 35, { width: 40 });
        doc.image(companyNamePath, 100, 45, { width: 120 });
      } catch (err) {
        // Fallback if images not found
        doc.fillColor('#FFFFFF').fontSize(20).text('MedicalKV', 50, 47);
      }

      doc.fillColor('#FFFFFF')
         .fontSize(10)
         .text('123 Education Lane', 200, 55, { align: 'right' })
         .text('New Delhi, India 110001', 200, 70, { align: 'right' })
         .moveDown();

      // Ensure stroke color for the line below header (if any) is correct, but since we have a colored header block, we can remove the stroke line or move it down.
      // We will remove the line since the color block acts as a divider.

      // Receipt Title
      doc.fontSize(20).fillColor('#0B1F4D').text('Payment Receipt', 50, 130);
      
      // Details
      doc.fontSize(12).fillColor('#333333')
         .text(`Receipt Number: ${paymentData.razorpayPaymentId}`, 50, 170)
         .text(`Date: ${new Date().toLocaleDateString()}`, 50, 190)
         .text(`Student Name: ${paymentData.studentName}`, 50, 210)
         .text(`Student Email: ${paymentData.studentEmail}`, 50, 230);

      // Table Header Background
      let invoiceTableTop = 290;
      doc.rect(50, invoiceTableTop - 10, 500, 25).fill('#0B1F4D');

      doc.font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Item', 60, invoiceTableTop);
      doc.text('Type', 300, invoiceTableTop);
      doc.text('Amount', 400, invoiceTableTop, { align: 'right', width: 140 });
      
      // Table Row
      doc.font('Helvetica').fillColor('#333333');
      doc.text(paymentData.courseName, 60, invoiceTableTop + 30, { width: 230 });
      doc.text(paymentData.type || 'Enrollment', 300, invoiceTableTop + 30);
      doc.text(`${paymentData.currency} ${paymentData.amount}`, 400, invoiceTableTop + 30, { align: 'right', width: 140 });

      // Total Line
      doc.strokeColor('#0B1F4D').lineWidth(1).moveTo(50, invoiceTableTop + 60).lineTo(550, invoiceTableTop + 60).stroke();
      doc.font('Helvetica-Bold').fillColor('#0B1F4D');
      doc.text('Total', 300, invoiceTableTop + 75);
      doc.text(`${paymentData.currency} ${paymentData.amount}`, 400, invoiceTableTop + 75, { align: 'right', width: 140 });

      // Footer
      doc.font('Helvetica').fillColor('#6073BA')
         .fontSize(10)
         .text('Thank you for learning with MedicalKV.', 50, 700, { align: 'center', width: 500 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
