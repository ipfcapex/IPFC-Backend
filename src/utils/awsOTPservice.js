require("dotenv").config();
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { SNSClient } = require("@aws-sdk/client-sns");
const express = require("express");
const AWS = require("aws-sdk");
const bodyParser = require("body-parser");

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

module.exports = { sns, sendEmailOTP, resendEmailOTP, sendEmailOTPforpasswordchange };