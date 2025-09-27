import { AuthProviders } from 'src/modules/user/enums/AuthProviders.enum';

export type AuthData = {
  email: string;
  surname: string; // Maps from `family_name`
  firstName: string; // Maps from `given_name`
  authId: string; // Maps from `id`
  name: string;
  pictureUrl: string; // Maps from `picture`
  verifiedEmail: boolean; // Maps from `verified_email`
  authProvider?: AuthProviders;
};
