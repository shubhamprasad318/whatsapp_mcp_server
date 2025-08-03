// Enhanced WhatsApp MCP Server with Robust Session Management
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Directories
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const SESSION_DIR = path.join(__dirname, '.wwebjs_auth');

async function ensureDirectories() {
    try {
        await fs.access(DOWNLOADS_DIR);
    } catch {
        await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    }
    
    try {
        await fs.access(SESSION_DIR);
    } catch {
        await fs.mkdir(SESSION_DIR, { recursive: true });
    }
}

// Clean up corrupted session data
async function cleanSession() {
    try {
        console.log('🧹 Cleaning potentially corrupted session data...');
        await fs.rm(SESSION_DIR, { recursive: true, force: true });
        console.log('✅ Session data cleaned');
    } catch (error) {
        console.log('ℹ️ No session data to clean or clean failed:', error.message);
    }
}

// Client state management
let client = null;
let isClientReady = false;
let qrCodeString = null;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;
let isInitializing = false;

// Create WhatsApp client with enhanced configuration
function createClient() {
    return new Client({
        authStrategy: new LocalAuth({
            dataPath: SESSION_DIR,
            clientId: 'whatsapp-mcp-server'
        }),
        puppeteer: { 
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ],
            timeout: 60000
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        }
    });
}

// Initialize client with proper event handlers
async function initializeClient() {
    if (isInitializing) {
        console.log('⏳ Client initialization already in progress...');
        return;
    }
    
    if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
        console.log('❌ Maximum initialization attempts reached. Cleaning session...');
        await cleanSession();
        initializationAttempts = 0;
    }
    
    isInitializing = true;
    initializationAttempts++;
    console.log(`🚀 Initializing WhatsApp client (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS})...`);
    
    // Clean up existing client
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            console.log('ℹ️ Error destroying previous client:', error.message);
        }
    }
    
    // Create new client
    client = createClient();
    
    // Event handlers
    client.on('qr', (qr) => {
        qrCodeString = qr;
        console.log('📱 New QR Code generated. Scan with WhatsApp mobile app.');
        qrcode.generate(qr, { small: true });
    });
    
    client.on('authenticated', () => {
        console.log('✅ WhatsApp Client authenticated successfully!');
        qrCodeString = null;
    });
    
    client.on('ready', () => {
        console.log('🎉 WhatsApp Client is ready and connected!');
        isClientReady = true;
        qrCodeString = null;
        initializationAttempts = 0;
        isInitializing = false;
    });
    
    client.on('auth_failure', async (msg) => {
        console.error('❌ Authentication failed:', msg);
        isClientReady = false;
        isInitializing = false;
        
        // Clean session on auth failure and retry
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            console.log('🔄 Cleaning session and retrying...');
            await cleanSession();
            setTimeout(() => initializeClient(), 5000);
        }
    });
    
    client.on('disconnected', async (reason) => {
        console.log('📱 WhatsApp Client disconnected:', reason);
        isClientReady = false;
        
        // Auto-reconnect on disconnect
        if (reason !== 'LOGOUT') {
            console.log('🔄 Attempting to reconnect...');
            setTimeout(() => initializeClient(), 10000);
        }
    });
    
    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ Loading: ${percent}% - ${message}`);
    });
    
    try {
        await client.initialize();
    } catch (error) {
        console.error('❌ Client initialization failed:', error.message);
        isInitializing = false;
        
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            console.log('🔄 Retrying initialization...');
            setTimeout(() => initializeClient(), 5000);
        }
    }
}

// Middleware to check if client is ready
const requireClientReady = (req, res, next) => {
    if (!isClientReady) {
        return res.status(503).json({ 
            error: 'WhatsApp client not ready', 
            qrCode: qrCodeString,
            message: qrCodeString ? 'Please scan QR code' : 'Client initializing...'
        });
    }
    next();
};

// Error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Health check endpoint with detailed status
app.get('/health', (req, res) => {
    res.json({
        status: isClientReady ? 'ready' : (isInitializing ? 'initializing' : 'not_ready'),
        qrCode: qrCodeString,
        timestamp: new Date().toISOString(),
        initializationAttempts,
        maxAttempts: MAX_INIT_ATTEMPTS,
        isInitializing
    });
});

// Force restart client endpoint
app.post('/restart', asyncHandler(async (req, res) => {
    console.log('🔄 Manual client restart requested...');
    isClientReady = false;
    initializationAttempts = 0;
    
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            console.log('ℹ️ Error destroying client during restart:', error.message);
        }
    }
    
    await initializeClient();
    res.json({ message: 'Client restart initiated', timestamp: new Date().toISOString() });
}));

// Clean session endpoint (useful for troubleshooting)
app.post('/clean-session', asyncHandler(async (req, res) => {
    console.log('🧹 Manual session clean requested...');
    
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            console.log('ℹ️ Error destroying client during clean:', error.message);
        }
    }
    
    await cleanSession();
    isClientReady = false;
    initializationAttempts = 0;
    
    // Reinitialize after cleaning
    setTimeout(() => initializeClient(), 2000);
    
    res.json({ message: 'Session cleaned and client reinitialized', timestamp: new Date().toISOString() });
}));

// Logout endpoint
app.post('/logout', requireClientReady, asyncHandler(async (req, res) => {
    await client.logout();
    isClientReady = false;
    res.json({ message: 'Logged out successfully', timestamp: new Date().toISOString() });
}));

// Get QR code for authentication
app.get('/qr', (req, res) => {
    if (isClientReady) {
        return res.json({ message: 'Client already authenticated' });
    }
    res.json({ qrCode: qrCodeString });
});

// 1. Search contacts with enhanced filtering
app.post('/search_contacts', requireClientReady, asyncHandler(async (req, res) => {
    const { query, limit = 50 } = req.body;
    
    if (!query || query.trim() === '') {
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const contacts = await client.getContacts();
    const filtered = contacts
        .filter(c => {
            const name = (c.name || '').toLowerCase();
            const number = (c.number || '');
            const pushname = (c.pushname || '').toLowerCase();
            const searchQuery = query.toLowerCase();
            
            return name.includes(searchQuery) || 
                   number.includes(query) || 
                   pushname.includes(searchQuery);
        })
        .slice(0, limit)
        .map(c => ({
            id: c.id._serialized,
            name: c.name,
            pushname: c.pushname,
            number: c.number,
            isBlocked: c.isBlocked,
            isGroup: c.isGroup
        }));
    
    res.json({ contacts: filtered, count: filtered.length });
}));

// 2. List messages with enhanced filtering
app.get('/list_messages', requireClientReady, asyncHandler(async (req, res) => {
    const { chatId, limit = 20, type, fromMe } = req.query;
    
    if (!chatId) {
        return res.status(400).json({ error: 'chatId parameter is required' });
    }
    
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: parseInt(limit) });
    
    let filtered = messages;
    
    // Filter by message type if specified
    if (type) {
        filtered = filtered.filter(msg => msg.type === type);
    }
    
    // Filter by sender if specified
    if (fromMe !== undefined) {
        const isFromMe = fromMe === 'true';
        filtered = filtered.filter(msg => msg.fromMe === isFromMe);
    }
    
    const processedMessages = filtered.map(msg => ({
        id: msg.id._serialized,
        body: msg.body,
        type: msg.type,
        timestamp: msg.timestamp,
        fromMe: msg.fromMe,
        author: msg.author,
        hasMedia: msg.hasMedia,
        isForwarded: msg.isForwarded,
        isStarred: msg.isStarred
    }));
    
    res.json({ 
        messages: processedMessages, 
        chatInfo: {
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            participantCount: chat.participants?.length || 0
        }
    });
}));

// 3. Get direct chat by contact
app.get('/get_direct_chat_by_contact', requireClientReady, asyncHandler(async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        return res.status(400).json({ error: 'number parameter is required' });
    }
    
    const chatId = number.includes('@c.us') ? number : number + '@c.us';
    const chat = await client.getChatById(chatId);
    
    res.json({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        isMuted: chat.isMuted,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage ? {
            body: chat.lastMessage.body,
            timestamp: chat.lastMessage.timestamp,
            fromMe: chat.lastMessage.fromMe
        } : null
    });
}));

// 4. Get contact chats with better filtering
app.get('/get_contact_chats', requireClientReady, asyncHandler(async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        return res.status(400).json({ error: 'number parameter is required' });
    }
    
    const targetId = number.includes('@c.us') ? number : number + '@c.us';
    const allChats = await client.getChats();
    
    const relevantChats = allChats
        .filter(chat => {
            if (chat.isGroup && Array.isArray(chat.participants)) {
                return chat.participants.some(p => p.id._serialized === targetId);
            }
            return chat.id._serialized === targetId;
        })
        .map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            participantCount: chat.participants?.length || 0,
            unreadCount: chat.unreadCount,
            lastMessage: chat.lastMessage ? {
                body: chat.lastMessage.body,
                timestamp: chat.lastMessage.timestamp
            } : null
        }));
    
    res.json({ chats: relevantChats, count: relevantChats.length });
}));

// 5. Get last interaction
app.get('/get_last_interaction', requireClientReady, asyncHandler(async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        return res.status(400).json({ error: 'number parameter is required' });
    }
    
    const chatId = number.includes('@c.us') ? number : number + '@c.us';
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 1 });
    
    if (messages.length === 0) {
        return res.json({ message: 'No messages found' });
    }
    
    const lastMessage = messages[0];
    res.json({
        id: lastMessage.id._serialized,
        body: lastMessage.body,
        type: lastMessage.type,
        timestamp: lastMessage.timestamp,
        fromMe: lastMessage.fromMe,
        hasMedia: lastMessage.hasMedia
    });
}));

// 6. Get message context
app.get('/get_message_context', requireClientReady, asyncHandler(async (req, res) => {
    const { chatId, messageId, before = 5, after = 5 } = req.query;
    
    if (!chatId || !messageId) {
        return res.status(400).json({ error: 'chatId and messageId parameters are required' });
    }
    
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 }); // Get more messages to find context
    
    const messageIndex = messages.findIndex(m => m.id._serialized === messageId);
    
    if (messageIndex === -1) {
        return res.status(404).json({ error: 'Message not found' });
    }
    
    const startIndex = Math.max(0, messageIndex - parseInt(before));
    const endIndex = Math.min(messages.length, messageIndex + parseInt(after) + 1);
    
    const context = messages.slice(startIndex, endIndex).map(msg => ({
        id: msg.id._serialized,
        body: msg.body,
        type: msg.type,
        timestamp: msg.timestamp,
        fromMe: msg.fromMe,
        isTarget: msg.id._serialized === messageId
    }));
    
    res.json({ context, targetMessageIndex: messageIndex - startIndex });
}));

// 7. Send message with better validation
app.post('/send_message', requireClientReady, asyncHandler(async (req, res) => {
    const { to, message, options = {} } = req.body;
    
    if (!to || !message) {
        return res.status(400).json({ error: 'to and message parameters are required' });
    }
    
    const chatId = to.includes('@c.us') || to.includes('@g.us') ? to : to + '@c.us';
    const sent = await client.sendMessage(chatId, message, options);
    
    res.json({
        id: sent.id._serialized,
        timestamp: sent.timestamp,
        ack: sent.ack,
        body: sent.body
    });
}));

// 8. Send file with validation
app.post('/send_file', requireClientReady, asyncHandler(async (req, res) => {
    const { to, filePath, caption } = req.body;
    
    if (!to || !filePath) {
        return res.status(400).json({ error: 'to and filePath parameters are required' });
    }
    
    try {
        await fs.access(filePath);
    } catch {
        return res.status(404).json({ error: 'File not found' });
    }
    
    const chatId = to.includes('@c.us') || to.includes('@g.us') ? to : to + '@c.us';
    const media = MessageMedia.fromFilePath(filePath);
    
    if (caption) {
        media.caption = caption;
    }
    
    const sent = await client.sendMessage(chatId, media);
    
    res.json({
        id: sent.id._serialized,
        timestamp: sent.timestamp,
        hasMedia: sent.hasMedia
    });
}));

// 9. Send audio message
app.post('/send_audio_message', requireClientReady, asyncHandler(async (req, res) => {
    const { to, audioPath } = req.body;
    
    if (!to || !audioPath) {
        return res.status(400).json({ error: 'to and audioPath parameters are required' });
    }
    
    try {
        await fs.access(audioPath);
    } catch {
        return res.status(404).json({ error: 'Audio file not found' });
    }
    
    const chatId = to.includes('@c.us') || to.includes('@g.us') ? to : to + '@c.us';
    const media = MessageMedia.fromFilePath(audioPath);
    const sent = await client.sendMessage(chatId, media, { sendAudioAsVoice: true });
    
    res.json({
        id: sent.id._serialized,
        timestamp: sent.timestamp,
        type: sent.type
    });
}));

// 10. Download media with better error handling
app.get('/download_media', requireClientReady, asyncHandler(async (req, res) => {
    const { chatId, messageId } = req.query;
    
    if (!chatId || !messageId) {
        return res.status(400).json({ error: 'chatId and messageId parameters are required' });
    }
    
    await ensureDownloadsDir();
    
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const msg = messages.find(m => m.id._serialized === messageId);
    
    if (!msg) {
        return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!msg.hasMedia) {
        return res.status(400).json({ error: 'Message has no media' });
    }
    
    const media = await msg.downloadMedia();
    const extension = media.mimetype.split('/')[1] || 'bin';
    const fileName = `${msg.id.id}_${Date.now()}.${extension}`;
    const filePath = path.join(DOWNLOADS_DIR, fileName);
    
    await fs.writeFile(filePath, media.data, 'base64');
    
    res.json({
        path: filePath,
        filename: fileName,
        mimetype: media.mimetype,
        size: Buffer.from(media.data, 'base64').length
    });
}));

// Get all chats
app.get('/get_chats', requireClientReady, asyncHandler(async (req, res) => {
    const { limit = 50, unreadOnly = false } = req.query;
    
    const chats = await client.getChats();
    let filtered = chats;
    
    if (unreadOnly === 'true') {
        filtered = chats.filter(chat => chat.unreadCount > 0);
    }
    
    const processedChats = filtered
        .slice(0, parseInt(limit))
        .map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            isReadOnly: chat.isReadOnly,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            lastMessage: chat.lastMessage ? {
                body: chat.lastMessage.body,
                timestamp: chat.lastMessage.timestamp,
                fromMe: chat.lastMessage.fromMe
            } : null
        }));
    
    res.json({ chats: processedChats, count: processedChats.length });
}));

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('API Error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// Initialize client and start server
async function startServer() {
    try {
        await ensureDirectories();
        console.log('📁 Directories ready');
        
        // Initialize WhatsApp client
        await initializeClient();
        
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🌐 MCP server running on port ${PORT}`);
            console.log(`📱 Health check: http://localhost:${PORT}/health`);
            console.log(`🔄 Restart client: POST http://localhost:${PORT}/restart`);
            console.log(`🧹 Clean session: POST http://localhost:${PORT}/clean-session`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (client) {
        try {
            await client.destroy();
            console.log('✅ WhatsApp client destroyed');
        } catch (error) {
            console.log('ℹ️ Error during shutdown:', error.message);
        }
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            console.log('ℹ️ Error during shutdown:', error.message);
        }
    }
    process.exit(0);
});

startServer();
