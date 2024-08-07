const app = {
    file: null,
    progress: 0,
    statusMessage: '',
    isSuccess: false,
    isError: false,
  
    handleFileUpload(event) {
      const files = event.target.files || event.dataTransfer.files;
      if (files.length) {
        this.file = files[0];
        this.statusMessage = 'File ready to upload';
        this.isSuccess = false;
        this.isError = false;
      }
    },
  
    async uploadFile() {
      if (!this.file) {
        this.statusMessage = 'No file selected';
        this.isError = true;
        return;
      }
  
      this.statusMessage = 'Uploading CSV...';
      this.progress = 0;
  
      const formData = new FormData();
      formData.append('file', this.file);
  
      try {
        const response = await fetch('<API-Gateway-Endpoint>', {
          method: 'POST',
          body: formData,
        });
  
        if (response.ok) {
          const result = await response.json();
          this.statusMessage = 'Emails sent successfully!';
          this.isSuccess = true;
          this.progress = 100;
        } else {
          throw new Error('Failed to upload file');
        }
      } catch (error) {
        console.error('Upload failed:', error);
        this.statusMessage = 'Error uploading file';
        this.isError = true;
      }
    }
  };
  
  export default app;
  