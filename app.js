const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const firebaseAdmin = require('firebase-admin');

const serviceAccount = require('../all-in-ls-firebase-adminsdk-fbsvc-b2691a3db0.json');
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
});
const db = firebaseAdmin.firestore();

const app = express();
const port = 3000;

app.use(bodyParser.json());

app.get('/payment', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).send('No token provided');
  }

  try {
    // 1. Fetch from banking API
    const { data } = await axios.get(`https://banking.gta.world/gateway_token/${token}`);

    const { payment, routing_from, token_expired } = data;
    if (!payment || !routing_from) {
      return res.status(400).send('Invalid response from banking API');
    }

    // 2. Check if the token is expired
    if (token_expired === true) {
      return res.status(400).send('Payment already processed. Token is expired.');
    }

    // 3. Find user by IBAN
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('iban', '==', routing_from).get();

    if (querySnapshot.empty) {
      return res.status(404).send('No user found with this IBAN');
    }

    const userDoc = querySnapshot.docs[0];
    const user = userDoc.data();

    // 4. Add payment to balance
    const currentBalance = typeof user.balance === 'number' ? user.balance : 0;
    const newBalance = currentBalance + payment;
    await userDoc.ref.update({ balance: newBalance });

    res.send(`Balance updated successfully! New balance: $${newBalance}`);
  } catch (error) {
    console.error('Error handling payment:', error.message);
    res.status(500).send('Internal server error');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
