// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';
// Domain index composing the real inventory engines that live beside it.
module.exports = { ...require('./warehouse-engine'), ...require('./inventory-ops-engine') };
