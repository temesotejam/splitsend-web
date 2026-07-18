export class SplitSendError extends Error {
  constructor(message, code = 'SPLITSEND_ERROR', details = undefined) {
    super(message);
    this.name = 'SplitSendError';
    this.code = code;
    this.details = details;
  }
}

export class CancelledError extends SplitSendError {
  constructor(message = '処理をキャンセルしました。') {
    super(message, 'CANCELLED');
    this.name = 'CancelledError';
  }
}

export class IntegrityError extends SplitSendError {
  constructor(message, details = undefined) {
    super(message, 'INTEGRITY_ERROR', details);
    this.name = 'IntegrityError';
  }
}
