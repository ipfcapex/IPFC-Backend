const express = require('express')
const router = express.Router();
const { schemesController } = require('../controllers')
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

router.post('/create', requireAuth, requireAdminRoles('Admin', 'Administrator'), schemesController.crtSchemes)
router.get('/', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Sales Person'), schemesController.getAll)
router.get('/:id', requireAuth, requireAdminRoles('Admin', 'Administrator'), schemesController.getById)
router.put('/:id', requireAuth, requireAdminRoles('Admin', 'Administrator'), schemesController.UpdateSchemsbyID)
router.delete('/delete/:id', requireAuth, requireAdminRoles('Admin', 'Administrator'), schemesController.softdelete)

module.exports = router;