const PDFDocument = require('pdfkit');
const path = require('path');

exports.generateReceiptPDF = (paymentData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      const primaryColor = '#333333';
      const secondaryColor = '#666666';
      
      // -- Header Box
      // Left Column Background (Dark Blue)
      doc.rect(30, 30, 350, 80).fill('#0B1F4D');

      // Top Border
      doc.rect(30, 30, 535, 80).stroke('#cccccc');

      // Logo Left
      const logoPath = path.join(__dirname, '../assets/dark_logo_transparent.png');
      try {
        doc.image(logoPath, 40, 35, { height: 70 });
      } catch (err) {
        doc.fillColor('#ffffff').fontSize(20).text('Academy Logo', 40, 50);
      }

      // Company Name Logo Next to Logo
      const companyNamePath = path.join(__dirname, '../assets/company_name_transparent.png');
      try {
        doc.image(companyNamePath, 125, 45, { height: 45 });
      } catch (err) {
        doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text('Dr. Sam Reefath Radiology Academy', 125, 60);
      }
      
      // TAX INVOICE Right
      doc.fillColor('#666666').fontSize(20).text('TAX INVOICE', 410, 65);

      // -- Meta Info Block
      doc.rect(30, 110, 535, 75).stroke('#cccccc');
      doc.moveTo(300, 110).lineTo(300, 185).stroke('#cccccc');

      const invoiceId = paymentData.invoiceNumber || `INV-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
      const currDate = new Date().toLocaleDateString();

      // Left Meta column
      doc.font('Helvetica').fontSize(9).fillColor(primaryColor);
      doc.text('#', 40, 120).text(`: ${invoiceId}`, 110, 120);
      doc.text('Invoice Date', 40, 135).text(`: ${currDate}`, 110, 135);
      doc.text('Terms', 40, 150).text(': Due on Receipt', 110, 150);
      doc.text('Due Date', 40, 165).text(`: ${currDate}`, 110, 165);

      // Right Meta column
      doc.text('Receipt ID', 310, 120).text(`: ${paymentData.razorpayPaymentId || 'N/A'}`, 380, 120);
      doc.text('Contact', 310, 135).text(': info@reefathradiology.com', 380, 135);

      // -- Bill To & Ship To header
      doc.rect(30, 185, 535, 20).fill('#f9fafb').stroke('#cccccc');
      doc.fillColor(primaryColor).font('Helvetica-Bold').text('Bill To', 40, 191);
      doc.moveTo(297, 185).lineTo(297, 205).stroke('#cccccc');
      doc.text('Participant Details', 310, 191);

      // Bill To Details
      doc.rect(30, 205, 535, 60).stroke('#cccccc');
      doc.moveTo(297, 205).lineTo(297, 265).stroke('#cccccc');
      
      const stName = paymentData.studentName || 'Student Name';
      const stEmail = paymentData.studentEmail || 'student@example.com';
      doc.font('Helvetica-Bold').fontSize(10).text(stName, 40, 215);
      doc.font('Helvetica').fontSize(9).text(stEmail, 40, 230);
      
      doc.font('Helvetica-Bold').fontSize(10).text(stName, 310, 215);
      doc.font('Helvetica').fontSize(9).text('Enrolled via Web Portal', 310, 230);

      // Format duration
      const durationRaw = paymentData.courseDuration || '365';
      let formattedDuration = '1 Year';
      if (String(durationRaw).toLowerCase() === 'lifetime') {
        formattedDuration = 'Lifetime Access';
      } else if (!isNaN(Number(durationRaw))) {
        const days = Number(durationRaw);
        if (days === 365 || days === 360) formattedDuration = '1-Year Access';
        else if (days === 180) formattedDuration = '6-Month Access';
        else if (days === 90) formattedDuration = '3-Month Access';
        else if (days === 30) formattedDuration = '1-Month Access';
        else formattedDuration = `${days}-Day Access`;
      } else {
        formattedDuration = durationRaw;
      }
      
      const subjectSuffix = formattedDuration === 'Lifetime Access' ? 'Lifetime Access' : (formattedDuration.includes('Access') ? formattedDuration : `${formattedDuration} Access`);

      // -- Subject
      doc.rect(30, 265, 535, 25).stroke('#cccccc');
      doc.font('Helvetica-Bold').text('Subject :', 40, 273, { continued: true }).font('Helvetica').text(` RE - Course Enrollment & ${subjectSuffix}`);

      // -- Table Headers
      doc.rect(30, 290, 535, 25).fill('#f9fafb').stroke('#cccccc');
      doc.moveTo(60, 290).lineTo(60, 315).stroke('#cccccc');
      doc.moveTo(350, 290).lineTo(350, 315).stroke('#cccccc');
      doc.moveTo(410, 290).lineTo(410, 315).stroke('#cccccc');
      doc.moveTo(480, 290).lineTo(480, 315).stroke('#cccccc');

      doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9);
      doc.text('#', 30, 298, { width: 30, align: 'center' });
      doc.text('Item & Description', 70, 298);
      doc.text('Qty', 350, 298, { width: 60, align: 'center' });
      doc.text('Rate', 410, 298, { width: 70, align: 'right' });
      doc.text('Amount', 480, 298, { width: 75, align: 'right' });

      // -- Table Content Row
      const tableY = 315;
      const courseName = paymentData.courseName || 'Medical Course';
      const baseAmtStr = `${paymentData.currency} ${paymentData.baseAmount || paymentData.amount}`;
      const totalAmtStr = `${paymentData.currency} ${paymentData.amount}`;
      const subtitle = `Full Curriculum Access + Live Webinars (${formattedDuration})`;

      doc.font('Helvetica-Bold');
      const titleHeight = doc.heightOfString(courseName, { width: 270 });
      doc.font('Helvetica');
      const subtitleHeight = doc.heightOfString(subtitle, { width: 270 });
      
      const rowHeight = Math.max(50, titleHeight + subtitleHeight + 20);

      doc.rect(30, tableY, 535, rowHeight).stroke('#cccccc');
      doc.moveTo(60, tableY).lineTo(60, tableY + rowHeight).stroke('#cccccc');
      doc.moveTo(350, tableY).lineTo(350, tableY + rowHeight).stroke('#cccccc');
      doc.moveTo(410, tableY).lineTo(410, tableY + rowHeight).stroke('#cccccc');
      doc.moveTo(480, tableY).lineTo(480, tableY + rowHeight).stroke('#cccccc');

      doc.font('Helvetica').text('1', 30, tableY + 10, { width: 30, align: 'center' });
      doc.font('Helvetica-Bold').text(courseName, 70, tableY + 10, { width: 270 });
      doc.font('Helvetica').fillColor(secondaryColor).text(subtitle, 70, doc.y + 2, { width: 270 });
      doc.fillColor(primaryColor).text('1.00', 350, tableY + 10, { width: 60, align: 'center' });
      doc.text(baseAmtStr, 410, tableY + 10, { width: 70, align: 'right' });
      doc.text(baseAmtStr, 480, tableY + 10, { width: 75, align: 'right' });

      // -- Footer Totals Area
      const footerY = tableY + rowHeight;
      doc.rect(30, footerY, 535, 150).stroke('#cccccc');
      doc.moveTo(350, footerY).lineTo(350, footerY + 150).stroke('#cccccc');

      // Left footer
      doc.font('Helvetica').fillColor(secondaryColor).text('Total In Words', 40, footerY + 10);
      doc.font('Helvetica-Bold').fillColor(primaryColor).text(`Amount Paid in ${paymentData.currency} Only`, 40, footerY + 25);

      doc.font('Helvetica-Bold').fillColor(secondaryColor).text('Notes', 40, footerY + 55);
      doc.font('Helvetica').fillColor(primaryColor).text('Thanks for choosing Dr. Sam Reefath Radiology Academy.', 40, footerY + 70);

      // Right footer totals
      doc.moveTo(350, footerY + 30).lineTo(565, footerY + 30).stroke('#cccccc');
      
      doc.font('Helvetica-Bold').text('Course Fee', 360, footerY + 12);
      doc.text(baseAmtStr, 480, footerY + 12, { width: 75, align: 'right' });

      let yOffset = footerY + 40;
      if (paymentData.paymentProcessingFee > 0) {
        doc.font('Helvetica').text('Processing Fee', 360, yOffset);
        doc.text(`${paymentData.currency} ${paymentData.paymentProcessingFee}`, 480, yOffset, { width: 75, align: 'right' });
        yOffset += 15;
        doc.text('GST (18% on Processing)', 360, yOffset);
        doc.text(`${paymentData.currency} ${paymentData.gstOnProcessingFee}`, 480, yOffset, { width: 75, align: 'right' });
        yOffset += 20;
      } else {
        yOffset += 35; // keep spacing consistent if free
      }

      doc.moveTo(350, yOffset - 10).lineTo(565, yOffset - 10).stroke('#cccccc');
      
      doc.font('Helvetica-Bold').text('Total', 360, yOffset - 2);
      doc.text(totalAmtStr, 480, yOffset - 2, { width: 75, align: 'right' });

      // Balance Due Box
      doc.rect(350, yOffset + 15, 215, 30).fill('#f9fafb').stroke('#cccccc');
      doc.fillColor(primaryColor).text('Balance Due', 360, yOffset + 25);
      doc.text(`${paymentData.currency} 0.00`, 480, yOffset + 25, { width: 75, align: 'right' });

      // Signature area
      const sigY = yOffset + 60;
      doc.font('Helvetica-Bold').fontSize(10).text('Dr. Sam Reefath Academy', 350, sigY, { width: 215, align: 'center' });

      // -- Bottom Terms
      const bottomTermsY = footerY + 165;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(secondaryColor).text('Account Details:-', 30, bottomTermsY);
      doc.font('Helvetica').fillColor(primaryColor).text('Payment securely processed via Razorpay Gateway.', 30, bottomTermsY + 15);
      doc.text(`Transaction ID - ${paymentData.razorpayPaymentId || 'N/A'}`, 30, bottomTermsY + 30);

      doc.font('Helvetica-Bold').fillColor(secondaryColor).text('Terms & Conditions', 30, bottomTermsY + 55);
      doc.font('Helvetica').fillColor(primaryColor).text('Access is valid for 12 months from the date of enrollment. Fees are non-transferable.', 30, bottomTermsY + 70);

      // -- Bottom Declaration
      doc.font('Helvetica-Bold').fontSize(8).fillColor(secondaryColor).text('Declaration', 30, 750);
      doc.font('Helvetica').text('We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.', 30, 762);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
