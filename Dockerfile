# Use an official Node.js runtime as a parent image
FROM public.ecr.aws/lambda/nodejs:20

# Set the working directory in the container
WORKDIR /var/task

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the application's dependencies
RUN npm install

# Copy the rest of the application's source code
COPY index.mjs ./

# Command to run your Lambda function
CMD ["index.handler"]
