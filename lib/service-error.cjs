'use strict';
class ServiceError extends Error{constructor(message,status=503){super(message);this.status=status;}}
module.exports={ServiceError};
