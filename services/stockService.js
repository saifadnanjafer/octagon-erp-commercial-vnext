(function () {
  'use strict';

  const root = window;
  const services = root.PentagonServices || {};
  root.PentagonServices = services;

  function tenant() {
    return root.TenantService || services.tenant || null;
  }

  function tenantScope(collection, records, options = {}) {
    return tenant()?.scope ? tenant().scope(collection, records, options) : records;
  }

  function tenantStamp(collection, record, options = {}) {
    return tenant()?.stamp ? tenant().stamp(record, { ...options, collection }) : record;
  }

  function tenantPrepareUpdate(collection, record, changes = {}, options = {}) {
    if (tenant()?.prepareUpdate) tenant().prepareUpdate(collection, record, changes, options);
    return record;
  }

  function findQuant(db, productId, locationId, lotId = '') {
    if (!Array.isArray(db.quants)) db.quants = [];
    return db.quants.find(quant =>
      quant.product_id === productId &&
      quant.location_id === locationId &&
      (quant.lot_id || '') === lotId
    );
  }

  function getLocation(db, locationId) {
    return (db.locations || []).find(location => location.id === locationId);
  }

  function getMaterial(db, productId) {
    return (db.omni?.materials || []).find(material => material.id === productId);
  }

  function isPhysicalLocation(location) {
    return location && location.type === 'internal';
  }

  function assertMovePayload(db, payload) {
    const productId = payload.product_id;
    const fromLoc = payload.location_id || payload.from_loc;
    const toLoc = payload.location_dest_id || payload.to_loc;
    const qty = Number(payload.quantity || payload.product_uom_qty || 0);

    if (!productId || !getMaterial(db, productId)) throw new Error('المادة غير موجودة');
    if (!fromLoc || !getLocation(db, fromLoc)) throw new Error('موقع المصدر غير موجود');
    if (!toLoc || !getLocation(db, toLoc)) throw new Error('موقع الوجهة غير موجود');
    if (fromLoc === toLoc) throw new Error('لا يمكن التحويل إلى نفس الموقع');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');

    return { productId, fromLoc, toLoc, qty };
  }

  function syncMainMaterialStock(db, productId) {
    const material = getMaterial(db, productId);
    const mainQuant = findQuant(db, productId, 'LOC_MAIN');
    if (!material || !mainQuant) return;
    material.stock = Number(mainQuant.quantity || 0);
    material.reservedQty = Number(mainQuant.reserved_quantity || 0);
    material.reserved = material.reservedQty;
    material.updated_at = services.utils.now();
    material.updated_by = root.PentagonAuth.getCurrentUser()?.id || 'system';
  }

  function adjustQuant(db, productId, locationId, delta, options = {}) {
    let quant = findQuant(db, productId, locationId, options.lot_id || '');
    if (!quant) {
      quant = root.RecordService._withAuditFields('quants', {
        product_id: productId,
        location_id: locationId,
        lot_id: options.lot_id || '',
        quantity: 0,
        reserved_quantity: 0,
        unit: options.unit || '',
      });
      db.quants.push(quant);
    }
    quant.quantity = Number(quant.quantity || 0) + Number(delta || 0);
    quant.available_quantity = Number(quant.quantity || 0) - Number(quant.reserved_quantity || 0);
    quant.updated_at = services.utils.now();
    quant.updated_by = root.PentagonAuth.getCurrentUser()?.id || 'system';
    return quant;
  }

  const StockService = {
    async createStockMove(payload = {}) {
      root.PermissionService.require('stock_moves', 'create');
      const db = await root.PentagonDB.load();
      const { productId, fromLoc, toLoc, qty } = assertMovePayload(db, payload);
      const move = await root.RecordService.create('stock_moves', {
        product_id: productId,
        product_uom_qty: qty,
        quantity: qty,
        qty_done: 0,
        location_id: fromLoc,
        location_dest_id: toLoc,
        origin: payload.origin || '',
        state: 'draft',
        date: services.utils.now(),
        unit: payload.unit || '',
        lot_id: payload.lot_id || '',
        picking_id: payload.picking_id || '',
      });
      await root.AuditService.createEvent('stock.move.created', move.id, move);
      return move;
    },

    async validateMove(moveId) {
      root.PermissionService.require('stock_moves', 'update');
      let completedMove;
      await root.PentagonDB.mutate(db => {
        const move = (db.stock_moves || []).find(item => item.id === moveId);
        tenantPrepareUpdate('stock_moves', move, {}, { db });
        if (!move) throw new Error('حركة المخزون غير موجودة');
        if (move.state === 'done') {
          completedMove = move;
          return;
        }
        if (move.state === 'cancel') throw new Error('لا يمكن اعتماد حركة ملغية');
        const fromLocation = getLocation(db, move.location_id);
        const qty = Number(move.qty_done || move.quantity || move.product_uom_qty || 0);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');
        if (isPhysicalLocation(fromLocation)) {
          const sourceQuant = findQuant(db, move.product_id, move.location_id, move.lot_id);
          const available = Number(sourceQuant?.available_quantity ?? (Number(sourceQuant?.quantity || 0) - Number(sourceQuant?.reserved_quantity || 0)));
          if (available < qty) throw new Error(`المتاح غير كافٍ في موقع المصدر: ${available}`);
        }
        adjustQuant(db, move.product_id, move.location_id, -qty, { lot_id: move.lot_id, unit: move.unit });
        adjustQuant(db, move.product_id, move.location_dest_id, qty, { lot_id: move.lot_id, unit: move.unit });
        syncMainMaterialStock(db, move.product_id);
        move.qty_done = qty;
        move.state = 'done';
        move.date_done = services.utils.now();
        move.updated_at = services.utils.now();
        completedMove = move;
      });
      await root.AuditService.createEvent('stock.move.done', moveId, completedMove);
      return completedMove;
    },

    async createInventoryAdjustment(payload = {}) {
      root.PermissionService.require('stock_moves', 'create');
      const db = await root.PentagonDB.load();
      const productId = payload.product_id;
      const locationId = payload.location_id || 'LOC_MAIN';
      const countedQty = Number(payload.counted_quantity);
      if (!productId || !getMaterial(db, productId)) throw new Error('المادة غير موجودة');
      if (!getLocation(db, locationId)) throw new Error('الموقع غير موجود');
      if (!Number.isFinite(countedQty) || countedQty < 0) throw new Error('الجرد يجب أن يكون صفراً أو أكثر');

      const quant = findQuant(db, productId, locationId, payload.lot_id || '');
      const currentQty = Number(quant?.quantity || 0);
      const delta = countedQty - currentQty;
      if (delta === 0) throw new Error('لا يوجد فرق بين الجرد والرصيد الحالي');

      const adjustmentLocation = 'LOC_SCRAP';
      const move = await this.createStockMove({
        product_id: productId,
        quantity: Math.abs(delta),
        from_loc: delta > 0 ? adjustmentLocation : locationId,
        to_loc: delta > 0 ? locationId : adjustmentLocation,
        origin: payload.origin || 'Inventory Adjustment',
        unit: payload.unit || getMaterial(db, productId)?.unit || '',
        lot_id: payload.lot_id || '',
      });
      move.adjustment = {
        counted_quantity: countedQty,
        previous_quantity: currentQty,
        delta,
        location_id: locationId,
      };
      await root.RecordService.update('stock_moves', move.id, { adjustment: move.adjustment });
      await root.StateService.transition('stock_moves', move.id, 'confirmed');
      return this.validateMove(move.id);
    },

    async getQuants(productId) {
      const db = await root.PentagonDB.load();
      return tenantScope('quants', db.quants || [], { db }).filter(quant => !productId || quant.product_id === productId);
    },

    // NEW: Lots/Serials management
    async createLot(productId, lotNumber, expirationDate = '') {
      root.PermissionService.require('stock_moves', 'create');
      let created;
      await root.PentagonDB.mutate(db => {
        if (!db.omni) db.omni = {};
        if (!Array.isArray(db.omni.lots)) db.omni.lots = [];
        const exists = db.omni.lots.find(l => l.product_id === productId && l.lot_number === lotNumber);
        if (exists) {
          created = exists;
          return;
        }
        const user = root.PentagonAuth.getCurrentUser();
        created = tenantStamp('omni.lots', {
          id: `lot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          product_id: productId,
          lot_number: lotNumber,
          expiration_date: expirationDate,
          created_at: services.utils.now(),
          created_by: user?.id || 'system',
          is_active: true
        }, { db });
        db.omni.lots.push(created);
      });
      await root.AuditService.createEvent('stock.lot.created', created.id, created);
      return created;
    },

    // NEW: Transfers management
    async createTransfer(payload = {}) {
      root.PermissionService.require('stock_moves', 'create');
      let created;
      await root.PentagonDB.mutate(db => {
        if (!Array.isArray(db.transfers)) db.transfers = [];
        if (!Array.isArray(db.stock_moves)) db.stock_moves = [];

        const fromLoc = payload.location_id || payload.from_loc;
        const toLoc = payload.location_dest_id || payload.to_loc;
        if (!fromLoc || !getLocation(db, fromLoc)) throw new Error('موقع المصدر غير موجود');
        if (!toLoc || !getLocation(db, toLoc)) throw new Error('موقع الوجهة غير موجود');
        if (fromLoc === toLoc) throw new Error('لا يمكن التحويل إلى نفس الموقع');
        if (!Array.isArray(payload.lines) || payload.lines.length === 0) throw new Error('يجب إضافة مادة واحدة على الأقل');

        const user = root.PentagonAuth.getCurrentUser();
        const now = services.utils.now();
        const year = new Date().getFullYear();
        const seq = (db.transfers.length + 1).toString().padStart(4, '0');
        const name = `TFR/${year}/${seq}`;

        created = tenantStamp('transfers', {
          id: `picking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          location_id: fromLoc,
          location_dest_id: toLoc,
          origin: payload.origin || '',
          state: 'draft',
          date: now,
          lines: payload.lines.map(line => {
            const material = getMaterial(db, line.product_id);
            if (!material) throw new Error(`المادة غير موجودة: ${line.product_id}`);
            return {
              product_id: line.product_id,
              quantity: Number(line.quantity || 0),
              unit: line.unit || material.unit || '',
              lot_id: line.lot_id || '',
              lot_number: line.lot_number || ''
            };
          }),
          created_at: now,
          created_by: user?.id || 'system',
          is_active: true
        }, { db });

        db.transfers.push(created);

        // Create draft stock moves for each line
        created.lines.forEach(line => {
          const move = root.RecordService._withAuditFields('stock_moves', {
            product_id: line.product_id,
            product_uom_qty: line.quantity,
            quantity: line.quantity,
            qty_done: 0,
            location_id: fromLoc,
            location_dest_id: toLoc,
            origin: created.name,
            state: 'draft',
            date: now,
            unit: line.unit,
            lot_id: line.lot_id || '',
            picking_id: created.id
          }, {}, { db });
          db.stock_moves.push(move);
        });
      });
      await root.AuditService.createEvent('stock.picking.created', created.id, created);
      return created;
    },

    async validateTransfer(transferId) {
      root.PermissionService.require('stock_moves', 'update');
      let completed;
      await root.PentagonDB.mutate(db => {
        const transfer = (db.transfers || []).find(t => t.id === transferId);
        tenantPrepareUpdate('transfers', transfer, {}, { db });
        if (!transfer) throw new Error('عملية التحويل غير موجودة');
        if (transfer.state === 'done') return;
        if (transfer.state === 'cancel') throw new Error('لا يمكن اعتماد تحويل ملغي');

        const moves = (db.stock_moves || []).filter(m => m.picking_id === transferId);
        moves.forEach(move => {
          tenantPrepareUpdate('stock_moves', move, {}, { db });
          if (move.state === 'done') return;
          if (move.state === 'cancel') return;
          const fromLocation = getLocation(db, move.location_id);
          const qty = Number(move.qty_done || move.quantity || move.product_uom_qty || 0);
          
          if (isPhysicalLocation(fromLocation)) {
            const sourceQuant = findQuant(db, move.product_id, move.location_id, move.lot_id);
            const available = Number(sourceQuant?.available_quantity ?? (Number(sourceQuant?.quantity || 0) - Number(sourceQuant?.reserved_quantity || 0)));
            if (available < qty) {
              const matName = getMaterial(db, move.product_id)?.name || move.product_id;
              throw new Error(`الكمية المتاحة غير كافية للمادة (${matName}): ${available}`);
            }
          }
          
          adjustQuant(db, move.product_id, move.location_id, -qty, { lot_id: move.lot_id, unit: move.unit });
          adjustQuant(db, move.product_id, move.location_dest_id, qty, { lot_id: move.lot_id, unit: move.unit });
          syncMainMaterialStock(db, move.product_id);
          
          move.qty_done = qty;
          move.state = 'done';
          move.date_done = services.utils.now();
        });

        transfer.state = 'done';
        transfer.date_done = services.utils.now();
        completed = transfer;
      });
      await root.AuditService.createEvent('stock.picking.done', transferId, completed);
      return completed;
    },

    async cancelTransfer(transferId) {
      root.PermissionService.require('stock_moves', 'update');
      let cancelled;
      await root.PentagonDB.mutate(db => {
        const transfer = (db.transfers || []).find(t => t.id === transferId);
        tenantPrepareUpdate('transfers', transfer, {}, { db });
        if (!transfer) throw new Error('عملية التحويل غير موجودة');
        if (transfer.state === 'done') throw new Error('لا يمكن إلغاء تحويل منجز');
        
        const moves = (db.stock_moves || []).filter(m => m.picking_id === transferId);
        moves.forEach(move => {
          tenantPrepareUpdate('stock_moves', move, {}, { db });
          if (move.state !== 'done') {
            move.state = 'cancel';
          }
        });
        
        transfer.state = 'cancel';
        cancelled = transfer;
      });
      await root.AuditService.createEvent('stock.picking.cancelled', transferId, cancelled);
      return cancelled;
    },

    // Dynamic valuation
    async getMaterialValuation(productId, method = 'avco') {
      const db = await root.PentagonDB.load();
      const material = getMaterial(db, productId);
      if (!material) return { currentQty: 0, unitCost: 0, totalValue: 0 };
      
      const mainQuants = tenantScope('quants', db.quants || [], { db }).filter(q => q.product_id === productId && q.location_id === 'LOC_MAIN');
      const currentQty = mainQuants.reduce((sum, q) => sum + Number(q.quantity || 0), 0);
      if (currentQty <= 0) return { currentQty: 0, unitCost: 0, totalValue: 0 };
      
      const receipts = tenantScope('stock_moves', db.stock_moves || [], { db })
        .filter(m => m.product_id === productId && m.state === 'done' && m.location_id === 'LOC_SUPPLIERS' && m.location_dest_id === 'LOC_MAIN')
        .sort((a, b) => String(a.date_done || a.date).localeCompare(String(b.date_done || b.date)));
      
      const fallbackCost = Number(material.cost || material.unitCost || 0);
      if (receipts.length === 0) {
        return {
          currentQty,
          unitCost: fallbackCost,
          totalValue: currentQty * fallbackCost
        };
      }
      
      if (method === 'avco') {
        let totalVal = 0;
        let totalQty = 0;
        receipts.forEach(r => {
          const qty = Number(r.quantity || r.qty_done || 0);
          let price = fallbackCost;
          if (r.price_unit !== undefined) price = Number(r.price_unit);
          else if (r.purchase_price !== undefined) price = Number(r.purchase_price);
          else {
            const matchingReceipt = (db.omni?.purchaseOrders || [])
              .find(po => po.name === r.origin || po.id === r.origin);
            if (matchingReceipt && matchingReceipt.items) {
              const item = matchingReceipt.items.find(i => i.materialId === productId);
              if (item && item.price) price = Number(item.price);
            }
          }
          totalVal += qty * price;
          totalQty += qty;
        });
        
        const unitCost = totalQty > 0 ? totalVal / totalQty : fallbackCost;
        return {
          currentQty,
          unitCost,
          totalValue: currentQty * unitCost
        };
      }
      
      const batches = receipts.map(r => {
        const qty = Number(r.quantity || r.qty_done || 0);
        let price = fallbackCost;
        if (r.price_unit !== undefined) price = Number(r.price_unit);
        else {
          const matchingReceipt = (db.omni?.purchaseOrders || [])
            .find(po => po.name === r.origin || po.id === r.origin);
          if (matchingReceipt && matchingReceipt.items) {
            const item = matchingReceipt.items.find(i => i.materialId === productId);
            if (item && item.price) price = Number(item.price);
          }
        }
        return { qty, price };
      });
      
      if (method === 'fifo') {
        let remaining = currentQty;
        let totalValue = 0;
        for (let i = batches.length - 1; i >= 0; i--) {
          const b = batches[i];
          const take = Math.min(remaining, b.qty);
          totalValue += take * b.price;
          remaining -= take;
          if (remaining <= 0) break;
        }
        if (remaining > 0) {
          totalValue += remaining * fallbackCost;
        }
        return {
          currentQty,
          unitCost: totalValue / currentQty,
          totalValue
        };
      }
      
      if (method === 'lifo') {
        let remaining = currentQty;
        let totalValue = 0;
        for (let i = 0; i < batches.length; i++) {
          const b = batches[i];
          const take = Math.min(remaining, b.qty);
          totalValue += take * b.price;
          remaining -= take;
          if (remaining <= 0) break;
        }
        if (remaining > 0) {
          totalValue += remaining * fallbackCost;
        }
        return {
          currentQty,
          unitCost: totalValue / currentQty,
          totalValue
        };
      }
      
      return { currentQty, unitCost: fallbackCost, totalValue: currentQty * fallbackCost };
    },

    // Reservation Release
    async releaseReservation(productId, resId) {
      root.PermissionService.require('stock_moves', 'update');
      let released = false;
      await root.PentagonDB.mutate(db => {
        const material = getMaterial(db, productId);
        tenantPrepareUpdate('omni.materials', material, {}, { db });
        if (!material) throw new Error('المادة غير موجودة');
        if (!Array.isArray(material.reservations)) return;
        
        const resIndex = material.reservations.findIndex(r => r.id === resId && r.status === 'reserved');
        if (resIndex !== -1) {
          const res = material.reservations[resIndex];
          res.status = 'released';
          res.releasedAt = services.utils.now();
          
          material.reservedQty = Math.max(0, (Number(material.reservedQty) || 0) - res.qty);
          material.reserved = material.reservedQty;
          
          const mainQuant = findQuant(db, productId, 'LOC_MAIN');
          if (mainQuant) {
            mainQuant.reserved_quantity = Math.max(0, (Number(mainQuant.reserved_quantity) || 0) - res.qty);
            mainQuant.available_quantity = Number(mainQuant.quantity || 0) - Number(mainQuant.reserved_quantity || 0);
          }
          
          const user = root.PentagonAuth.getCurrentUser();
          const movement = {
            id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'released',
            qty: res.qty,
            sourceType: res.sourceType || 'manual',
            sourceId: res.sourceId || '',
            ref: res.title || '',
            note: 'تم إلغاء الحجز يدوياً',
            actor: user?.name || 'system',
            date: services.utils.now(),
            stockAfter: Number(material.stock) || 0,
            reservedAfter: Number(material.reservedQty) || 0
          };
          
          if (!Array.isArray(material.movements)) material.movements = [];
          material.movements.push(movement);
          released = true;
        }
      });
      return released;
    }
  };

  root.StockService = StockService;
  services.stock = StockService;
})();
