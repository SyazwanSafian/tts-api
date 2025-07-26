// index.js - Main API endpoints for TTS application

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');

// Import our custom modules
const {
    saveConversion,
    getConversions,
    deleteConversion,
    uploadFile,
    deleteFile
} = require('./firebase');
const { convertAndSaveAudio } = require('./tts');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text());

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // still keep your 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'text/plain'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and TXT files are allowed'), false);
        }
    }
});


// Helper function to extract text from buffer
async function extractTextFromBuffer(buffer, mimetype) {
    try {
        if (mimetype === 'application/pdf') {
            const data = await pdf(buffer);
            return data.text;
        } else if (mimetype === 'text/plain') {
            return buffer.toString('utf-8');
        } else {
            throw new Error('Unsupported file type');
        }
    } catch (error) {
        console.error('Error extracting text from buffer:', error);
        throw error;
    }
}


// Helper function to generate unique filename
function generateFileName(userId, type = 'audio') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}_${userId}_${timestamp}_${random}`;
}

// POST /convert - Convert text or file to audio
app.post('/convert', upload.single('file'), async (req, res) => {

    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID is required'
            });
        }

        let textContent = '';
        let inputType = '';
        let originalFileName = null;
        let originalFileUrl = null;

        // Handle file upload
        if (req.file) {
            const buffer = req.file.buffer;
            originalFileName = req.file.originalname;

            // Determine input type
            inputType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'txt';

            // Extract text from uploaded buffer
            textContent = await extractTextFromBuffer(buffer, req.file.mimetype);

            // Upload original file to Firebase Storage
            const storageFileName = `uploads/${generateFileName(userId, 'original')}.${inputType}`;
            originalFileUrl = await uploadFile(storageFileName, buffer, req.file.mimetype);
        } else if (req.body.text) {
            // Handle direct text input
            textContent = req.body.text;
            inputType = 'text';
        } else {
            return res.status(400).json({
                error: 'No text or file provided'
            });
        }


        // Validate text content
        if (!textContent.trim()) {
            return res.status(400).json({
                error: 'Empty text content'
            });
        }

        if (textContent.length > 5000) {
            return res.status(400).json({
                error: 'Text too long. Maximum 5000 characters allowed.'
            });
        }

        // Generate unique audio filename
        const audioFileName = `audio/${generateFileName(userId, 'audio')}.mp3`;

        // Convert text to audio and save
        const audioResult = await convertAndSaveAudio(textContent, audioFileName);

        // Save conversion record to Firestore
        const conversionData = {
            text: textContent,
            inputType: inputType,
            originalFileName: originalFileName,
            originalFileUrl: originalFileUrl,
            audioUrl: audioResult.audioUrl,
            status: 'completed',
            completedAt: new Date(),
            textLength: textContent.length
        };

        const conversionId = await saveConversion(userId, conversionData);

        console.log(`Conversion completed for user ${userId}, ID: ${conversionId}`);

        // Send response
        res.json({
            success: true,
            conversionId: conversionId,
            audioUrl: audioResult.audioUrl,
            textLength: textContent.length,
            inputType: inputType,
            message: 'Text successfully converted to audio'
        });

    } catch (error) {
        console.error('Conversion error:', error);

        res.status(500).json({
            error: 'Conversion failed',
            message: error.message
        });
    } finally {
        // Clean up temporary file
        if (tempFilePath) {
            try {

            } catch (cleanupError) {
                console.error('Error cleaning up temp file:', cleanupError);
            }
        }
    }
});

// GET /conversions/:userId - Get all conversions for a user
app.get('/conversions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID is required'
            });
        }

        const conversions = await getConversions(userId);

        console.log(`Retrieved ${conversions.length} conversions for user ${userId}`);

        res.json({
            success: true,
            count: conversions.length,
            conversions: conversions
        });

    } catch (error) {
        console.error('Error retrieving conversions:', error);
        res.status(500).json({
            error: 'Failed to retrieve conversions',
            message: error.message
        });
    }
});

// DELETE /conversions/:userId/:conversionId - Delete a specific conversion
app.delete('/conversions/:userId/:conversionId', async (req, res) => {
    try {
        const { userId, conversionId } = req.params;

        if (!userId || !conversionId) {
            return res.status(400).json({
                error: 'User ID and Conversion ID are required'
            });
        }

        // First, get the conversion data to find associated files
        const conversions = await getConversions(userId);
        const conversion = conversions.find(c => c.id === conversionId);

        if (!conversion) {
            return res.status(404).json({
                error: 'Conversion not found'
            });
        }

        // Delete associated files from storage
        const filesToDelete = [];

        // Add original file if it exists
        if (conversion.originalFileUrl) {
            const originalFileName = conversion.originalFileUrl.split('/').pop();
            filesToDelete.push(`uploads/${originalFileName}`);
        }

        // Add audio file
        if (conversion.audioUrl) {
            const audioFileName = conversion.audioUrl.split('/').pop();
            filesToDelete.push(`audio/${audioFileName}`);
        }

        // Delete files from Firebase Storage
        for (const fileName of filesToDelete) {
            try {
                await deleteFile(fileName);
            } catch (fileError) {
                console.error(`Error deleting file ${fileName}:`, fileError);
                // Continue with other deletions even if one fails
            }
        }

        // Delete conversion record from Firestore
        await deleteConversion(userId, conversionId);

        console.log(`Conversion ${conversionId} deleted for user ${userId}`);

        res.json({
            success: true,
            message: 'Conversion and associated files deleted successfully',
            deletedConversionId: conversionId
        });

    } catch (error) {
        console.error('Error deleting conversion:', error);
        res.status(500).json({
            error: 'Failed to delete conversion',
            message: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'TTS API'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large. Maximum size is 10MB.'
            });
        }
    }

    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`TTS API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;