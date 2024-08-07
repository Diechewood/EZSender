function selectFile(event, isDrop = false) {
    const file = isDrop ? event.dataTransfer.files[0] : event.target.files[0];
    if (file && file.type === 'text/csv') { // Only allow CSV files
      this.fileSelected = true;
      this.fileName = file.name;
      this.progress = 0; // Reset progress when a new file is selected
      this.uploading = false; // Reset uploading state
    } else if (file) {
      alert('Please select a valid CSV file.');
      this.fileSelected = false;
      this.fileName = '';
    }
  }
  
  function triggerFileSelect() {
    document.getElementById('fileInput').click();
  }
  
  async function uploadFile() {
    if (!this.fileSelected) {
      alert('Please select a file first.');
      return;
    }
  
    this.progress = 0; // Reset progress at the start of an upload
    this.uploading = true; // Set uploading state
    const file = document.querySelector('input[type=file]').files[0];
    const reader = new FileReader();
  
    reader.onload = async () => {
      try {
        const response = await fetch('<YOUR_API_GATEWAY_ENDPOINT>', { // Update with your API Gateway endpoint
          method: 'POST',
          body: reader.result,
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-amz-meta-filename': this.fileName, // Custom metadata header to pass filename
          },
        });
  
        if (response.ok) {
          this.progress = 100;
          this.uploading = false; // Reset uploading state
          alert('File uploaded successfully');
        } else {
          alert('Failed to upload file. Please try again.');
        }
      } catch (error) {
        console.error('Upload failed:', error);
        alert('An error occurred during the upload. Please try again.');
      }
    };
  
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        this.progress = Math.round((event.loaded / event.total) * 100);
      }
    };
  
    reader.readAsArrayBuffer(file);
  }
  