import { IsInt, IsIn, IsNotEmpty, IsOptional, IsString, Max, Min, Length, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProfileDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(16)
  @Max(99)
  age: number;

  @IsString()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender: string;

  @IsString()
  @IsIn(['MALE', 'FEMALE', 'ANY'])
  searchGender: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  locationLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  locationLon?: number;
}
