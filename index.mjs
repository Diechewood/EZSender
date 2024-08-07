import AWS from 'aws-sdk';
import csv from 'csv-parser';
import { Readable } from 'stream';

const s3 = new AWS.S3();
const ses = new AWS.SES({ region: 'us-west-1' });

class CircuitBreaker {
  constructor(failureThreshold = 5, successThreshold = 2, timeout = 30000) {
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.timeout = timeout;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }

  async call(action) {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        this.state = 'HALF';
      } else {
        throw new Error('Circuit is open');
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    if (this.state === 'HALF') {
      this.successCount++;
      if (this.successCount > this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
      }
    }
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

const circuitBreaker = new CircuitBreaker();

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

    // Define batch size for processing emails
    const batchSize = 10;

    // Send emails in batches using circuit breaker
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const emailPromises = batch.map((recipient) => sendEmailWithCircuitBreaker(recipient));
      await Promise.all(emailPromises);
      console.log(`Batch ${i / batchSize + 1} processed successfully.`);
    }

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
 * Sends an email using AWS SES with retry logic.
 * @param {Object} recipient - An object containing recipient name and email.
 * @param {number} attempt - Current retry attempt number.
 */
const sendEmailWithRetry = async (recipient, attempt = 1) => {
  const maxRetries = 3;
  const retryDelay = 1000 * Math.pow(2, attempt); // Exponential backoff

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
    Source: 'ezsenderaws@gmail.com',
  };

  try {
    await ses.sendEmail(params).promise();
    console.log(`Email sent to ${recipient.email}`);
  } catch (error) {
    console.error(`Failed to send email to ${recipient.email}:`, error);

    if (attempt < maxRetries && isTransientError(error)) {
      console.log(`Retrying to send email to ${recipient.email} (Attempt ${attempt + 1})...`);
      await delay(retryDelay);
      return sendEmailWithRetry(recipient, attempt + 1);
    } else {
      console.error(`Max retries reached. Could not send email to ${recipient.email}.`);
    }
  }
};

/**
 * Determines if an error is a transient error.
 * @param {Error} error - The error object.
 * @returns {boolean} True if the error is transient, otherwise false.
 */
const isTransientError = (error) => {
  const transientErrors = ['Throttling', 'InternalFailure', 'ServiceUnavailable'];
  return transientErrors.includes(error.code);
};

/**
 * Delays execution for a specified amount of time.
 * @param {number} ms - The delay time in milliseconds.
 * @returns {Promise} A promise that resolves after the delay.
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends an email using AWS SES with a circuit breaker.
 * @param {Object} recipient - An object containing recipient name and email.
 */
const sendEmailWithCircuitBreaker = async (recipient) => {
  try {
    await circuitBreaker.call(() => sendEmailWithRetry(recipient));
  } catch (error) {
    console.error(`Circuit breaker activated for email to ${recipient.email}:`, error);
  }
};
