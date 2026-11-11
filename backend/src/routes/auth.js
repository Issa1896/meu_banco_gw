const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { registerValidator, resetPasswordValidator } = require('../utils/validators');
const {
  loginLimiter, mfaLimiter, mfaManageLimiter, passwordResetLimiter,
} = require('../middleware/security');

router.post('/register', registerValidator, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/verify-2fa', mfaLimiter, authController.verify2FA);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPasswordValidator, authController.resetPassword);

// Biometria: desativada (responde 501) até a verificação WebAuthn ser implementada
router.post('/biometric/login', authController.loginBiometric);

router.use(authenticate);

router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.post('/biometric/register', authController.registerBiometricKey);
router.get('/2fa/setup', authController.setup2FA);
router.post('/2fa/enable', mfaManageLimiter, authController.enable2FA);
router.post('/2fa/disable', mfaManageLimiter, authController.disable2FA);
router.delete('/account', authController.deleteAccount);

module.exports = router;
