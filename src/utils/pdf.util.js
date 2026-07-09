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
      
      // -- Header Box (No blue background, just clean borders or lines if needed)
      // Top Border
      doc.rect(30, 30, 535, 80).stroke('#cccccc');

      // Logo Left
      const logoPath = path.join(__dirname, '../assets/dark_logo_transparent.png');
      try {
        doc.image(logoPath, 40, 45, { height: 45 });
      } catch (err) {
        doc.fillColor(primaryColor).fontSize(20).text('Academy Logo', 40, 50);
      }

      // Company Name Logo Next to Logo
      const companyNamePath = path.join(__dirname, '../assets/company_name_transparent.png');
      try {
        doc.image(companyNamePath, 100, 58, { height: 18 });
      } catch (err) {
        doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('Dr. Sam Reefath Radiology Academy', 100, 60);
      }
      
      doc.moveTo(270, 30).lineTo(270, 110).stroke('#cccccc');

      // Academy Info Middle
      doc.font('Helvetica').fontSize(9).fillColor(primaryColor).text('Academic Head Office', 280, 45);
      doc.text('123 Medical Avenue, Ground Floor', 280, 58);
      doc.text('London, UK W1G 0BJ', 280, 71);
      doc.text('United Kingdom', 280, 84);

      doc.moveTo(420, 30).lineTo(420, 110).stroke('#cccccc');

      // TAX INVOICE Right
      doc.fillColor('#666666').fontSize(20).text('TAX INVOICE', 430, 65);

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
      if (durationRaw === 'lifetime' || durationRaw.toLowerCase() === 'lifetime') {
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
      doc.rect(30, 315, 535, 50).stroke('#cccccc');
      doc.moveTo(60, 315).lineTo(60, 365).stroke('#cccccc');
      doc.moveTo(350, 315).lineTo(350, 365).stroke('#cccccc');
      doc.moveTo(410, 315).lineTo(410, 365).stroke('#cccccc');
      doc.moveTo(480, 315).lineTo(480, 365).stroke('#cccccc');

      const courseName = paymentData.courseName || 'Medical Course';
      const amtStr = `${paymentData.currency} ${paymentData.amount}`;

      doc.font('Helvetica').text('1', 30, 325, { width: 30, align: 'center' });
      doc.font('Helvetica-Bold').text(courseName, 70, 325);
      doc.font('Helvetica').fillColor(secondaryColor).text(`Full Curriculum Access + Live Webinars (${formattedDuration})`, 70, 340);
      doc.fillColor(primaryColor).text('1.00', 350, 325, { width: 60, align: 'center' });
      doc.text(amtStr, 410, 325, { width: 70, align: 'right' });
      doc.text(amtStr, 480, 325, { width: 75, align: 'right' });

      // -- Footer Totals Area
      doc.rect(30, 365, 535, 150).stroke('#cccccc');
      doc.moveTo(350, 365).lineTo(350, 515).stroke('#cccccc');

      // Left footer
      doc.font('Helvetica').fillColor(secondaryColor).text('Total In Words', 40, 375);
      doc.font('Helvetica-Bold').fillColor(primaryColor).text(`Amount Paid in ${paymentData.currency} Only`, 40, 390);

      doc.font('Helvetica-Bold').fillColor(secondaryColor).text('Notes', 40, 420);
      doc.font('Helvetica').fillColor(primaryColor).text('Thanks for choosing Dr. Sam Reefath Radiology Academy.', 40, 435);

      // Right footer totals
      doc.moveTo(350, 395).lineTo(565, 395).stroke('#cccccc');
      doc.moveTo(350, 425).lineTo(565, 425).stroke('#cccccc');
      
      doc.font('Helvetica-Bold').text('Sub Total', 360, 377);
      doc.text(amtStr, 480, 377, { width: 75, align: 'right' });

      doc.text('Total', 360, 407);
      doc.text(amtStr, 480, 407, { width: 75, align: 'right' });

      // Balance Due Box
      doc.rect(350, 425, 215, 30).fill('#f9fafb').stroke('#cccccc');
      doc.fillColor(primaryColor).text('Balance Due', 360, 435);
      doc.text(`${paymentData.currency} 0.00`, 480, 435, { width: 75, align: 'right' });

      // Signature area
      doc.font('Helvetica-Bold').fontSize(10).text('Dr. Sam Reefath Academy', 350, 470, { width: 215, align: 'center' });
      
      doc.moveTo(380, 495).lineTo(535, 495).stroke('#cccccc');
      doc.font('Helvetica').fontSize(8).fillColor(secondaryColor).text('Authorized Signature', 350, 500, { width: 215, align: 'center' });

      // -- Bottom Terms
      doc.font('Helvetica-Bold').fontSize(9).fillColor(secondaryColor).text('Account Details:-', 30, 530);
      doc.font('Helvetica').fillColor(primaryColor).text('Payment securely processed via Razorpay Gateway.', 30, 545);
      doc.text(`Transaction ID - ${paymentData.razorpayPaymentId || 'N/A'}`, 30, 560);

      doc.font('Helvetica-Bold').fillColor(secondaryColor).text('Terms & Conditions', 30, 585);
      doc.font('Helvetica').fillColor(primaryColor).text('Access is valid for 12 months from the date of enrollment. Fees are non-transferable.', 30, 600);

      // -- Bottom Declaration
      doc.font('Helvetica-Bold').fontSize(8).fillColor(secondaryColor).text('Declaration', 30, 750);
      doc.font('Helvetica').text('We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.', 30, 762);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
