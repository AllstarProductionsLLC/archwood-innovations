'use strict';
const {ServiceError}=require('./service-error.cjs');
function firestoreOptions(env=process.env){
 if(!env.GCP_PROJECT_ID)throw new ServiceError('Website reviews are temporarily unavailable. Please contact Archwood for a security review.');
 const options={projectId:env.GCP_PROJECT_ID,databaseId:env.GCP_FIRESTORE_DATABASE_ID||'archwood-security',preferRest:true};
 const mode=env.GCP_AUTH_MODE||(env.VERCEL?'wif':'adc');
 if(mode==='adc')return options;
 if(mode!=='wif')throw new ServiceError('Google Cloud authentication needs configuration.');
 const names=['GCP_PROJECT_NUMBER','GCP_SERVICE_ACCOUNT_EMAIL','GCP_WORKLOAD_IDENTITY_POOL_ID','GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'];
 if(names.some(name=>!env[name]))throw new ServiceError('Google Cloud authentication needs configuration.');
 const {ExternalAccountClient}=require('google-auth-library');
 const {getVercelOidcToken}=require('@vercel/oidc');
 const resource=`//iam.googleapis.com/projects/${env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`;
 options.authClient=ExternalAccountClient.fromJSON({type:'external_account',audience:resource,subject_token_type:'urn:ietf:params:oauth:token-type:jwt',token_url:'https://sts.googleapis.com/v1/token',service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,subject_token_supplier:{getSubjectToken:()=>getVercelOidcToken()}});
 return options;
}
let cached;
function firestore(env=process.env){
 const options=firestoreOptions(env);
 if(!cached){const {Firestore}=require('@google-cloud/firestore');cached=new Firestore(options);}
 return cached;
}
module.exports={firestore,firestoreOptions};
