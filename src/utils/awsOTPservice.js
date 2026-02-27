require("dotenv").config();
const { SESClient, SendEmailCommand, SendRawEmailCommand  } = require("@aws-sdk/client-ses");
const { SNSClient } = require("@aws-sdk/client-sns");
const express = require("express");
const AWS = require("aws-sdk");
const bodyParser = require("body-parser");
const {generateStockPDF} = require("../utils/PdfGenetrator");

console.log("AWS Region:", process.env.AWS_REGION);

const sns = new SNSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

// 1. Setup the Client using environment variables for security!
const sesClient = new SESClient({
  region: process.env.AWS_REGION_ID,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2. The Test Function - Now accepts arguments
const sendEmailOTP = async (recipientEmail, otp) => {
  const params = {
    Source: "noreply@apexshoes.org",
    Destination: {
      ToAddresses: [recipientEmail],
    },
    
    Message: {
      Subject: { Data: "Your Secure Login Code" },
      Body: {
        Html: {
          Data: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 50px 20px; text-align: center;">
            
              <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 40px 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
               <h1 style="font-size: 36px; letter-spacing: 6px; color: #0d6efd;">Apex</h1>
                <h1 style="color: #2c3e50; margin-top: 0; font-size: 26px; font-weight: 600;">Authentication Code</h1>
                <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                  You are almost in. Please use the following one-time password to securely complete your login:
                </p>
                <div style="background-color: #f8f9fa; border: 1px dashed #ced4da; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                  <b style="font-size: 36px; letter-spacing: 6px; color: #0d6efd;">${otp}</b>
                </div>
                <p style="color: #888888; font-size: 14px; margin-bottom: 0;">
                  This code will expire in 5 minutes. If you did not request this, ignore this email.
                </p>
              </div>
              <p style="color: #aaaaaa; font-size: 12px; margin-top: 25px;">
                &copy; ${new Date().getFullYear()} Apex Shoes. All rights reserved.
              </p>
            </div>
          `,
        },
      },
    },
  };

  const command = new SendEmailCommand(params);
  const result = await sesClient.send(command); // ✅ uses sesClient
  console.log(`✅ Email sent to ${recipientEmail} | Message ID: ${result.MessageId}`);
  console.log("recipientEmail, otp", recipientEmail, otp);
  return result;
};

const resendEmailOTP = async (recipientEmail, otp) => {
  const params = {
    Source: "noreply@apexshoes.org",
    Destination: {
      ToAddresses: [recipientEmail],
    },
    
    Message: {
      Subject: { Data: "Your Secure Login Code" },
      Body: {
        Html: {
          Data: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 50px 20px; text-align: center;">
            
              <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 40px 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
               <h1 style="font-size: 36px; letter-spacing: 6px; color: #0d6efd;">Apex</h1>
                <h1 style="color: #2c3e50; margin-top: 0; font-size: 26px; font-weight: 600;">Authentication Code</h1>
                <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                  Please use the following one-time password:
                </p>
                <div style="background-color: #f8f9fa; border: 1px dashed #ced4da; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                  <b style="font-size: 36px; letter-spacing: 6px; color: #0d6efd;">${otp}</b>
                </div>
                <p style="color: #888888; font-size: 14px; margin-bottom: 0;">
                  This code will expire in 5 minutes. If you did not request this, ignore this email.
                </p>
              </div>
              <p style="color: #aaaaaa; font-size: 12px; margin-top: 25px;">
                &copy; ${new Date().getFullYear()} Apex Shoes. All rights reserved.
              </p>
            </div>
          `,
        },
      },
    },
  };

  const command = new SendEmailCommand(params);
  const result = await sesClient.send(command); // ✅ uses sesClient
  console.log(`✅ Email sent to ${recipientEmail} | Message ID: ${result.MessageId}`);
  console.log("recipientEmail, otp", recipientEmail, otp);
  return result;
};

const sendEmailOTPforpasswordchange = async (recipientEmail, otp) => {
  const params = {
    Source: "noreply@apexshoes.org",
    Destination: {
      ToAddresses: [recipientEmail],
    },
    
    Message: {
      Subject: { Data: "Your Secure Login Code" },
      Body: {
        Html: {
          Data: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 50px 20px; text-align: center;">
            
              <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 40px 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
               <h1 style="font-size: 36px; letter-spacing: 6px; color: #0d6efd;">Apex</h1>
                <h1 style="color: #2c3e50; margin-top: 0; font-size: 26px; font-weight: 600;">Authentication Code</h1>
                <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                  You are almost in. Please use the following one-time password to securely complete your Password Change:
                </p>
                <div style="background-color: #f8f9fa; border: 1px dashed #ced4da; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                  <b style="font-size: 36px; letter-spacing: 6px; color: #0d6efd;">${otp}</b>
                </div>
                <p style="color: #888888; font-size: 14px; margin-bottom: 0;">
                  This code will expire in 5 minutes. If you did not request this, ignore this email.
                </p>
              </div>
              <p style="color: #aaaaaa; font-size: 12px; margin-top: 25px;">
                &copy; ${new Date().getFullYear()} Apex Shoes. All rights reserved.
              </p>
            </div>
          `,
        },
      },
    },
  };

  const command = new SendEmailCommand(params);
  const result = await sesClient.send(command); // ✅ uses sesClient
  console.log(`✅ Email sent to ${recipientEmail} | Message ID: ${result.MessageId}`);
  console.log("recipientEmail, otp", recipientEmail, otp);
  return result;
};

const buildHTML = (data, monthName) => {
  const tableStyle = `border-collapse: collapse; width: 100%; margin-bottom: 24px;`;
  const thStyle = `border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left;`;
  const tdStyle = `border: 1px solid #ddd; padding: 8px;`;

  const articleSummaryRows = (data?.articleSummary || [])
    .map((item) => `
      <tr>
        <td style="${tdStyle}">${item._id}</td>
        <td style="${tdStyle}">${item.totalQuantitySold}</td>
        <td style="${tdStyle}">${item.totalOrders}</td>
      </tr>`)
    .join("");

  const cumulativeRows = (data?.cumulativeTotalByArticle || [])
    .map((item) => `
      <tr>
        <td style="${tdStyle}">${item.articleOrCategory}</td>
        <td style="${tdStyle}">${item.categoryCode}</td>
        <td style="${tdStyle}">${item.grandTotalQuantity}</td>
        <td style="${tdStyle}">${item.totalOrderLines}</td>
      </tr>`)
    .join("");

  const colorSizeRows = (data?.colorSizeSummary || [])
    .map((item) => `
      <tr>
        <td style="${tdStyle}">${item.articleOrCategory}</td>
        <td style="${tdStyle}">${item.color}</td>
        <td style="${tdStyle}">${item.size}</td>
        <td style="${tdStyle}">${item.totalQuantitySold}</td>
      </tr>`)
    .join("");

  return `
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="text-align:center;">Stock Report - ${monthName}</h2>

        <h3>Tally Total</h3>
        <table style="${tableStyle}">
          <thead>
            <tr>
              <th style="${thStyle}">Total Sales</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="${tdStyle}">${data?.TallyTotal?.[0]?.totalSales || 0}</td>
            </tr>
          </tbody>
        </table>

        <h3>Article Summary</h3>
        <table style="${tableStyle}">
          <thead>
            <tr>
              <th style="${thStyle}">Article</th>
              <th style="${thStyle}">Qty Sold</th>
              <th style="${thStyle}">Total Orders</th>
            </tr>
          </thead>
          <tbody>${articleSummaryRows}</tbody>
        </table>

        <h3>Cumulative Total by Article</h3>
        <table style="${tableStyle}">
          <thead>
            <tr>
              <th style="${thStyle}">Article</th>
              <th style="${thStyle}">Category Code</th>
              <th style="${thStyle}">Grand Total Qty</th>
              <th style="${thStyle}">Order Lines</th>
            </tr>
          </thead>
          <tbody>${cumulativeRows}</tbody>
        </table>

        <h3>Color & Size Summary</h3>
        <table style="${tableStyle}">
          <thead>
            <tr>
              <th style="${thStyle}">Article</th>
              <th style="${thStyle}">Color</th>
              <th style="${thStyle}">Size</th>
              <th style="${thStyle}">Qty Sold</th>
            </tr>
          </thead>
          <tbody>${colorSizeRows}</tbody>
        </table>

      </body>
    </html>
  `;
};

// const sendStockEmail = async (data, monthName) => {
//   const htmlBody = buildHTML(data, monthName);

//   const params = {
//     Source: "noreply@apexshoes.org",
//     Destination: {
//   ToAddresses: ["bhuvaneshwarpatil@sdlccorp.com"],
// },
//     Message: {
//       Subject: {
//         Data: `Stock Report - ${monthName}`,
//       },
//       Body: {
//         Html: {
//           Data: htmlBody,
//         },
//       },
//     },
//   };

//   const command = new SendEmailCommand(params);
//   const result = await sesClient.send(command);
//   console.log(`✅ Stock report email sent | Message ID: ${result.MessageId}`);
//   return result;
// };

const sendStockEmail = async (data, monthName) => {
  const pdfBuffer = await generateStockPDF(data, monthName);
  const boundary = "NextPart";

  const rawEmail = [
    `From: noreply@apexshoes.org`,
    `To: hargunn01@gmail.com`,
    `Subject: Stock Report - ${monthName}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    `<div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #0d6efd;">Welcome to Apex Sales Report</h2>
      <p>Open the attached PDF below.</p>
    </div>`,
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="stock-report-${monthName}.pdf"`,
    "",
    pdfBuffer.toString("base64"),
    "",
    `--${boundary}--`,
  ].join("\n");

  const command = new SendRawEmailCommand({
    RawMessage: { Data: Buffer.from(rawEmail) },
  });

  const result = await sesClient.send(command);
  console.log(`✅ Stock report email sent | Message ID: ${result.MessageId}`);
  return result;
};

module.exports = { sns, sendEmailOTP, resendEmailOTP, sendEmailOTPforpasswordchange, sendStockEmail };