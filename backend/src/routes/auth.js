const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { registerValidator } = require('../utils/validators');
const { loginLimiter } = require('../middleware/security');

router.post('/register', registerValidator, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/verify-2fa', authController.verify2FA);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.use(authenticate);

router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.post('/biometric/register', authController.registerBiometricKey);
router.post('/biometric/login', authController.loginBiometric);
router.get('/2fa/setup', authController.setup2FA);
router.post('/2fa/enable', authController.enable2FA);
router.post('/2fa/disable', authController.disable2FA);
router.delete('/account', authController.deleteAccount);

module.exports = router;
