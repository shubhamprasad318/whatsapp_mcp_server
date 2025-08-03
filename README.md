# **WhatsApp MCP Server**

A robust Model Context Protocol (MCP) server for WhatsApp Web integration with enhanced session management, media handling, and comprehensive messaging capabilities.

## **Features**

* **Robust Session Management**: Automatic session recovery and authentication handling  
* **QR Code Authentication**: Easy setup with WhatsApp mobile app  
* **Message Operations**: Send/receive text, media, and audio messages  
* **Contact Management**: Search and manage contacts  
* **Chat Operations**: List chats, get message history with filtering  
* **Media Handling**: Download and send various media types  
* **Auto-reconnection**: Automatic reconnection on disconnect  
* **Health Monitoring**: Comprehensive health check endpoints  
* **Error Handling**: Robust error handling and logging

## **Prerequisites**

* Node.js (v14 or higher)  
* npm or yarn  
* Chrome/Chromium browser (for Puppeteer)  
* WhatsApp account

## **Installation**

**Clone or download the server file**

 \# Create project directory  
mkdir whatsapp-mcp-server  
cd whatsapp-mcp-server

\# Save the server code as app.js  
**Install dependencies**

 npm init \-y  
npm install express whatsapp-web.js qrcode-terminal cors puppeteer

## **Usage**

### **Starting the Server**

node app.js

The server will start on port 3000 (or the port specified in the `PORT` environment variable).

### **Initial Setup**

1. **Start the server** and watch the console for QR code  
2. **Scan the QR code** with your WhatsApp mobile app  
3. **Wait for authentication** \- the server will show "WhatsApp Client is ready and connected\!"

### **Health Check**

Check server status:

curl http://localhost:3000/health

Response includes:

* Server status (`ready`, `initializing`, `not_ready`)  
* QR code (if authentication needed)  
* Initialization attempts  
* Timestamp

## **API Endpoints**

### **Authentication & Management**

#### **`GET /health`**

Get server status and health information.

#### **`GET /qr`**

Get current QR code for authentication.

#### **`POST /restart`**

Manually restart the WhatsApp client.

#### **`POST /clean-session`**

Clean session data and reinitialize client.

#### **`POST /logout`**

Logout from WhatsApp.

### **Contact Operations**

#### **`POST /search_contacts`**

Search contacts by name, number, or pushname.

{  
  "query": "john",  
  "limit": 50  
}

#### **`GET /get_direct_chat_by_contact`**

Get direct chat information by contact number.

Query params: `number` (phone number)

#### **`GET /get_contact_chats`**

Get all chats involving a specific contact.

Query params: `number` (phone number)

### **Message Operations**

#### **`GET /list_messages`**

Get messages from a specific chat with filtering options.

Query params:

* `chatId` (required): Chat ID  
* `limit`: Number of messages (default: 20\)  
* `type`: Filter by message type  
* `fromMe`: Filter by sender (true/false)

#### **`POST /send_message`**

Send a text message.

{  
  "to": "1234567890@c.us",  
  "message": "Hello World\!",  
  "options": {}  
}

#### **`GET /get_last_interaction`**

Get the last message from a specific contact.

Query params: `number` (phone number)

#### **`GET /get_message_context`**

Get messages before and after a specific message.

Query params:

* `chatId` (required)  
* `messageId` (required)  
* `before`: Messages before (default: 5\)  
* `after`: Messages after (default: 5\)

### **Media Operations**

#### **`POST /send_file`**

Send a file attachment.

{  
  "to": "1234567890@c.us",  
  "filePath": "/path/to/file.jpg",  
  "caption": "Optional caption"  
}

#### **`POST /send_audio_message`**

Send an audio message.

{  
  "to": "1234567890@c.us",  
  "audioPath": "/path/to/audio.mp3"  
}

#### **`GET /download_media`**

Download media from a message.

Query params:

* `chatId` (required)  
* `messageId` (required)

### **Chat Operations**

#### **`GET /get_chats`**

Get list of all chats.

Query params:

* `limit`: Number of chats (default: 50\)  
* `unreadOnly`: Show only unread chats (true/false)

## **Phone Number Format**

Phone numbers should be in international format:

* Include country code (e.g., `1234567890` for US number)  
* The server automatically adds `@c.us` suffix for individual chats  
* Group chats use `@g.us` suffix

## **File Paths**

* **Downloads**: Files are saved to `./downloads/` directory  
* **Session Data**: Stored in `./.wwebjs_auth/` directory  
* Use absolute paths when sending files

## **Error Handling**

The server includes comprehensive error handling:

* **503 Service Unavailable**: Client not ready (includes QR code if needed)  
* **400 Bad Request**: Missing required parameters  
* **404 Not Found**: Resource not found (message, file, etc.)  
* **500 Internal Server Error**: Server errors

## **Troubleshooting**

### **Common Issues**

1. **QR Code Not Appearing**

   * Check console output  
   * Visit `/health` endpoint  
   * Try `/restart` endpoint  
2. **Authentication Failures**

   * Use `/clean-session` endpoint  
   * Restart the server  
   * Ensure WhatsApp mobile app is updated  
3. **Client Not Ready**

   * Wait for initialization (can take 30-60 seconds)  
   * Check `/health` for status  
   * Look for error messages in console  
4. **Media Upload/Download Issues**

   * Ensure file paths are absolute  
   * Check file permissions  
   * Verify file exists before sending

### **Logs**

The server provides detailed logging:

* 🚀 Initialization steps  
* 📱 QR code generation  
* ✅ Success messages  
* ❌ Error messages  
* 🔄 Reconnection attempts

### **Manual Recovery**

\# Restart client  
curl \-X POST http://localhost:3000/restart

\# Clean session data  
curl \-X POST http://localhost:3000/clean-session

\# Check health  
curl http://localhost:3000/health

## **Environment Variables**

* `PORT`: Server port (default: 3000\)  
* `NODE_ENV`: Environment mode

## **Security Considerations**

* Run on localhost or secure network  
* Implement authentication for production use  
* Regularly clean session data if needed  
* Monitor for unauthorized access

## **Development**

### **Project Structure**

whatsapp-mcp-server/  
├── app.js              \# Main server file  
├── downloads/          \# Downloaded media files  
├── .wwebjs\_auth/       \# WhatsApp session data  
├── package.json        \# Dependencies  
└── README.md          \# This file

### **Adding Features**

The server is designed to be extensible. Common additions:

* Webhook support for incoming messages  
* Database integration for message history  
* Rate limiting for API endpoints  
* User authentication and authorization

## **License**

This project is provided as-is for educational and development purposes. Ensure compliance with WhatsApp's Terms of Service when using this server.

## **Contributing**

Feel free to submit issues and enhancement requests. When contributing:

1. Test thoroughly  
2. Follow existing code style  
3. Update documentation  
4. Add appropriate error handling

## **Support**

For issues and questions:

1. Check the troubleshooting section  
2. Review console logs  
3. Test with `/health` endpoint  
4. Try session cleanup if needed

