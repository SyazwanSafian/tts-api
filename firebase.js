//backend firebase.js - for backend to connect to Firestore/Storage

//-----ADMIN SDK Setup, different than Front End which uses Client SDK Setup-------//
const admin = require('firebase-admin');
const serviceAccount = require('./tts-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'bustling-bot-464601-a9.firebasestorage.app'
});

const db = admin.firestore(); //database connection
const storage = admin.storage();
//----------- END of ADMIN SDK Setup-------------//


//save conversion data(text input) to Firestore
async function saveConversion(userId, conversionData) {
    try {
        const docRef = db.collection('users').doc(userId).collection('conversions').doc();
        const conversionWithId = {
            ...conversionData,
            id: docRef.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await docRef.set(conversionWithId);
        console.log(`Conversion saved for user ${userId} with ID: ${docRef.id}`);
        return docRef.id;
    } catch (error) {
        console.error('Error saving conversion:', error);
        throw error;
    }
};

//GET(listing of all conversions by userId) endpoint
async function getConversions(userId) {
    try {
        const collectionRef = db.collection('users').doc(userId).collection('conversions');
        const querySnapshot = await collectionRef.get();

        const conversions = [];
        querySnapshot.forEach((doc) => {
            conversions.push({ id: doc.id, ...doc.data() });
        });

        console.log(`All conversions for user ${userId}:`, conversions);
        return conversions;
    } catch (error) {
        console.error('Error getting conversion:', error);
        throw error;
    }
};

async function deleteConversion(userId, conversionId) {
    try {
        const docRef = db.collection('users').doc(userId).collection('conversions').doc(conversionId);
        await docRef.delete();
        console.log(`Conversion ${conversionId} deleted for user ${userId}`);
        return conversionId;
    } catch (error) {
        console.error('Error deleting conversion:', error)
        throw error;
    }
};

//to upload file to Firebase storage
async function uploadFile(fileName, fileBuffer, contentType) {
    try {
        const file = storage.bucket().file(fileName);
        await file.save(fileBuffer, {
            metadata: {
                contentType: contentType
            }
        });

        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${storage.bucket().name}/${fileName}`;

        console.log(`File uploaded: ${fileName}`);
        return publicUrl;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
};

// Delete file from Firebase Storage
async function deleteFile(fileName) {
    try {
        const file = storage.bucket().file(fileName);
        await file.delete();

        console.log(`File deleted: ${fileName}`);
        return true;
    } catch (error) {
        console.error('Error deleting file:', error);
        throw error;
    }
}

module.exports = { db, storage, admin, saveConversion, getConversions, deleteConversion, uploadFile, deleteFile };