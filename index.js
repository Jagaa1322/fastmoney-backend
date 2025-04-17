// Backend for FastMoney.games
// Stack: Node.js + Express + MongoDB + JWT + Manual Bank Transfer + Socket.IO + Docker + Nginx

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createServer } = require('http');
const { Server } = require('socket.io');

dotenv.config();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log(err));

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// User model with role and email
const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  password: String,
  email: String,
  role: { type: String, default: 'user' },
  wallet: { type: Number, default: 10000 },
}));

// Deposit request model
const DepositRequest = mongoose.model('DepositRequest', new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  utr: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token, user: { username: user.username, wallet: user.wallet, role: user.role } });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password, email } = req.body;
  const hashed = bcrypt.hashSync(password, 10);
  const user = new User({ username, password: hashed, email });
  await user.save();
  res.json({ message: 'User registered successfully' });
});

// Wallet Route
app.get('/api/wallet', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    res.json({ wallet: user.wallet });
  } catch {
    res.sendStatus(403);
  }
});

// Deposit request submission
app.post('/api/deposit/request', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { amount, utr } = req.body;
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const request = new DepositRequest({ userId: decoded.id, amount, utr });
    await request.save();
    res.json({ message: 'Deposit request submitted successfully' });
  } catch {
    res.sendStatus(403);
  }
});

// Admin approves deposit
app.post('/api/deposit/approve', async (req, res) => {
  const { requestId } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.id);
    if (admin.role !== 'admin') return res.sendStatus(403);

    const request = await DepositRequest.findById(requestId);
    if (!request || request.status !== 'pending') return res.status(404).json({ message: 'Invalid request' });

    const user = await User.findById(request.userId);
    user.wallet += request.amount;
    await user.save();

    request.status = 'approved';
    await request.save();

    res.json({ message: 'Deposit approved and wallet updated successfully' });
  } catch {
    res.sendStatus(403);
  }
});

// Manual Bank Transfer Details Endpoint
app.get('/api/payment/manual-details', (req, res) => {
  res.json({
    bankName: 'FastMoney Bank',
    accountName: 'FastMoney Games Pvt Ltd',
    accountNumber: '1234567890',
    ifsc: 'FAST0001234',
    upiId: 'fastmoney@upi',
    note: 'Send UTR/reference number through support after payment.'
  });
});

// Sportsbook Odds Mock API
const sampleOdds = [
  { match: 'India vs Australia', odds: { India: 1.8, Australia: 2.0 } },
  { match: 'Real Madrid vs Barcelona', odds: { Madrid: 1.6, Barca: 2.2 } },
];

app.get('/api/sportsbook/odds', (req, res) => {
  res.json(sampleOdds);
});

// Socket.IO Realtime Odds
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  const interval = setInterval(() => {
    socket.emit('liveOdds', sampleOdds);
  }, 5000);
  socket.on('disconnect', () => clearInterval(interval));
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));