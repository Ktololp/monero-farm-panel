/** Central application error model. */
export class AppError extends Error {
  constructor(code, message, { status = 500, details = null, cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
  toJSON() { return { code: this.code, message: this.message, ...(this.details == null ? {} : { details: this.details }) }; }
}
export class ConfigurationError extends AppError { constructor(message, options={}) { super('CONFIGURATION_ERROR', message, { status: 500, ...options }); } }
export class SshConnectionError extends AppError { constructor(message='SSH connection failed', options={}) { super('SSH_CONNECTION_ERROR', message, { status: 502, ...options }); } }
export class XmrigApiError extends AppError { constructor(message='XMRig API unavailable', options={}) { super('XMRIG_API_UNAVAILABLE', message, { status: 502, ...options }); } }
export class MonerodRpcError extends AppError { constructor(message='monerod RPC unavailable', options={}) { super('MONEROD_RPC_UNAVAILABLE', message, { status: 502, ...options }); } }
