import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class GoogleAuthQueryDto {
  @ApiPropertyOptional({ enum: ['web', 'mobile'], default: 'web' })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  platform: 'web' | 'mobile' = 'web';

  @ApiPropertyOptional({ description: 'Mobile only; must start with an entry of MOBILE_REDIRECT_ALLOWLIST' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  redirectUri?: string;

  @ApiPropertyOptional({ description: 'Mobile only: PKCE S256 challenge, base64url, 43-128 chars' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/, { message: 'codeChallenge must be base64url, 43-128 characters' })
  codeChallenge?: string;
}

export class ExchangeCodeDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  code: string;

  @ApiPropertyOptional({ description: 'Required when the flow started with platform=mobile (PKCE)' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9._~-]{43,128}$/, { message: 'codeVerifier must be 43-128 RFC 7636 characters' })
  codeVerifier?: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Mobile sends it in the body; web relies on the refresh cookie' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class EmailStartDto {
  @ApiProperty({ example: 'asha@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;
}

export class EmailVerifyDto extends EmailStartDto {
  @ApiProperty({ example: '042317', description: 'The 6-digit code from the email' })
  @Matches(/^\d{6}$/, { message: 'The code has 6 digits' })
  code: string;
}

export class AppleSignInDto {
  /** The `identityToken` from Sign in with Apple on iOS. */
  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  identityToken: string;

  /** Apple shares the name only on the first sign-in. */
  @ApiPropertyOptional({ example: 'Asha' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  givenName?: string;

  @ApiPropertyOptional({ example: 'Rao' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  familyName?: string;
}
