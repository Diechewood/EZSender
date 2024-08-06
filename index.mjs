import AWS from 'aws-sdk';
import csv from 'csv-parser';
import { Readable } from 'stream';

const s3 = new AWS.S3();
const ses = new AWS.SES({ region: 'us-west-1' });

/**
 * Lambda function handler.
 * @param {Object} event - The event object provided by AWS Lambda, typically an S3 event.
 */
export const handler = async (event) => {
  console.log('Starting Lambda function execution...');
  
  // Log the entire event for debugging purposes
  console.log('Event received:', JSON.stringify(event, null, 2));

  // Extract bucket name and object key directly from the event
  const bucketName = event.Records[0].s3.bucket.name;
  const objectKey = event.Records[0].s3.object.key;

  console.log(`Bucket: ${bucketName}, Object Key: ${objectKey}`);

  try {
    // Parameters for fetching the CSV file from S3
    const params = {
      Bucket: bucketName,
      Key: objectKey,
    };

    // Fetch the CSV file from S3
    const data = await s3.getObject(params).promise();
    console.log('CSV file fetched successfully:', objectKey);

    // Parse the CSV file to extract recipient information
    const recipients = await parseCSV(data.Body);

    // Send emails to all recipients
    const emailPromises = recipients.map((recipient) => sendEmail(recipient));
    await Promise.all(emailPromises);

    console.log('Emails sent successfully');
    return { statusCode: 200, body: 'Emails sent successfully' };

  } catch (error) {
    console.error('Error processing the S3 event:', error);
    return { statusCode: 500, body: 'Failed to send emails' };
  }
};

/**
 * Parses the CSV file data.
 * @param {Buffer} buffer - The CSV file data as a Buffer.
 * @returns {Promise<Array>} A promise that resolves to an array of recipient objects.
 */
const parseCSV = async (buffer) => {
  return new Promise((resolve, reject) => {
    const recipients = [];
    
    // Convert the buffer into a readable stream
    const stream = Readable.from(buffer.toString());

    stream.pipe(csv())
      .on('data', (row) => {
        if (row.Email) {
          recipients.push({ name: row.Name, email: row.Email });
        } else {
          console.warn('Skipping row with missing Email:', row);
        }
      })
      .on('end', () => {
        console.log('CSV parsing completed. Parsed recipients:', recipients.length);
        resolve(recipients);
      })
      .on('error', (error) => {
        console.error('Error parsing CSV file:', error);
        reject(error);
      });
  });
};

/**
 * Sends an email using AWS SES.
 * @param {Object} recipient - An object containing recipient name and email.
 */
const sendEmail = async (recipient) => {
  const params = {
    Destination: {
      ToAddresses: [recipient.email],
    },
    Message: {
      Body: {
        Text: { Data: `Hello ${recipient.name}, this is a test email from AWS Lambda!` },
      },
      Subject: { Data: 'Test Email' },
    },
    Source: 'ezsenderaws@gmail.com',  // Use your verified SES email address
  };

  try {
    await ses.sendEmail(params).promise();
    console.log(`Email sent to ${recipient.email}`);
  } catch (error) {
    console.error(`Failed to send email to ${recipient.email}:`, error);
    throw error;
  }
};
