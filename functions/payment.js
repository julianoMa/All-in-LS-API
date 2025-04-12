const axios = require('axios');
const firebaseAdmin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
});
const db = firebaseAdmin.firestore();

exports.handler = async function(event, context) {
  const urlPath = event.path;
  const tokenMatch = urlPath.match(/^\/api\/payment(.+)$/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!token) {
    console.error("No token provided in path");
    return {
      statusCode: 400,
      body: 'No token provided',
    };
  }

  try {
    // 1. Fetch from banking API
    const { data } = await axios.get(`https://fleeca.gta.world/gateway_token/${token}`);
    console.log("Response from banking API:", data);

    const { payment, routing_from, token_expired } = data;

    // 2. Check if the token is expired
    if (token_expired) {
      console.error("Token expired, payment already processed.");
      return {
        statusCode: 400,
        body: 'Already gave money (Token expired)',
      };
    }

    if (!payment || !routing_from) {
      console.error("Invalid response from banking API");
      return {
        statusCode: 400,
        body: 'Invalid response from banking API',
      };
    }

    console.log(`Found payment: ${payment} and routing_from (IBAN): ${routing_from}`);

    // 3. Find user by IBAN
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('iban', '==', routing_from).get();

    if (querySnapshot.empty) {
      console.error("No user found with IBAN:", routing_from);
      return {
        statusCode: 404,
        body: 'No user found with this IBAN',
      };
    }

    const userDoc = querySnapshot.docs[0];
    const user = userDoc.data();
    console.log('User found:', user);

    // 4. Add payment to balance
    const currentBalance = typeof user.balance === 'number' ? user.balance : 0;
    const newBalance = currentBalance + payment;
    await userDoc.ref.update({ balance: newBalance });

    console.log(`Balance updated successfully! New balance: $${newBalance}`);

    return {
      statusCode: 200,
      body: `Balance updated successfully! New balance: $${newBalance}`,
    };
  } catch (error) {
    console.error("Error during payment processing:", error.message);
    return {
      statusCode: 500,
      body: `Internal server error: ${error.message}`,
    };
  }
};
