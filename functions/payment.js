const axios = require('axios');
const firebaseAdmin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('../all-in-ls-firebase-adminsdk-fbsvc-b2691a3db0.json');
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
});
const db = firebaseAdmin.firestore();

exports.handler = async function(event, context) {
  const token = event.queryStringParameters.token;
  if (!token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'No token provided' }),  // Send message as JSON
    };
  }

  try {
    // 1. Fetch from banking API
    const { data } = await axios.get(`https://banking.gta.world/gateway_token/${token}`);
    const { payment, routing_from } = data;

    if (!payment || !routing_from) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid response from banking API' }), // Send message as JSON
      };
    }

    // 2. Find user by IBAN
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('iban', '==', routing_from).get();

    if (querySnapshot.empty) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'No user found with this IBAN' }), // Send message as JSON
      };
    }

    const userDoc = querySnapshot.docs[0];
    const user = userDoc.data();

    // 3. Add payment to balance
    const currentBalance = typeof user.balance === 'number' ? user.balance : 0;
    const newBalance = currentBalance + payment;
    await userDoc.ref.update({ balance: newBalance });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Balance updated successfully! New balance: $${newBalance}` }), // Send message as JSON
    };
  } catch (error) {
    console.error('Error handling payment:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }), // Send message as JSON
    };
  }
};
