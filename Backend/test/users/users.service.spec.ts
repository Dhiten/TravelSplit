import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, IsNull, SoftDeleteResult } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../../src/modules/users/services/users.service';
import { User } from '../../src/modules/users/entities/user.entity';
import { CreateUserDto } from '../../src/modules/users/dto/create-user.dto';
import { UpdateUserDto } from '../../src/modules/users/dto/update-user.dto';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;

  const bcryptHashSpy = jest.spyOn(bcrypt, 'hash');

  beforeEach(async () => {
    const userRepositoryMock: Partial<jest.Mocked<Repository<User>>> = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('debe crear un usuario cuando el email no existe', async () => {
      // Arrange
      const dto: CreateUserDto = {
        nombre: 'Juan',
        email: 'juan@example.com',
        contraseña: 'passwordSeguro',
      };

      userRepository.findOne.mockResolvedValue(null);
      bcryptHashSpy.mockResolvedValue('hashed-password' as never);

      const savedUser: User = {
        id: '1',
        nombre: dto.nombre,
        email: dto.email,
        passwordHash: 'hashed-password',
        deletedAt: null,
      } as User;

      userRepository.save.mockResolvedValue(savedUser);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: dto.email, deletedAt: IsNull() },
      });
      expect(bcryptHashSpy).toHaveBeenCalledWith(dto.contraseña, 10);
      expect(userRepository.save).toHaveBeenCalled();
      expect(result).toEqual(savedUser);
    });

    it('debe lanzar ConflictException si el email ya existe', async () => {
      // Arrange
      const dto: CreateUserDto = {
        nombre: 'Juan',
        email: 'juan@example.com',
        contraseña: 'passwordSeguro',
      };

      const existingUser = { id: '1' } as User;
      userRepository.findOne.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(bcryptHashSpy).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('debe devolver todos los usuarios activos', async () => {
      // Arrange
      const users: User[] = [
        { id: '1', email: 'a@example.com', nombre: 'A', deletedAt: null } as User,
        { id: '2', email: 'b@example.com', nombre: 'B', deletedAt: null } as User,
      ];

      userRepository.find.mockResolvedValue(users);

      // Act
      const result = await service.findAll();

      // Assert
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { deletedAt: IsNull() },
      });
      expect(result).toEqual(users);
    });
  });

  describe('findOne', () => {
    it('debe devolver el usuario cuando existe', async () => {
      // Arrange
      const id = '1';
      const user: User = {
        id,
        email: 'a@example.com',
        nombre: 'A',
        deletedAt: null,
      } as User;

      userRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.findOne(id);

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id, deletedAt: IsNull() },
      });
      expect(result).toEqual(user);
    });

    it('debe lanzar NotFoundException cuando el usuario no existe', async () => {
      // Arrange
      const id = '1';
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('debe devolver el usuario cuando existe para el email dado', async () => {
      // Arrange
      const email = 'a@example.com';
      const user: User = {
        id: '1',
        email,
        nombre: 'A',
        deletedAt: null,
      } as User;

      userRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.findByEmail(email);

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email, deletedAt: IsNull() },
      });
      expect(result).toEqual(user);
    });

    it('debe devolver null cuando el usuario no existe para el email dado', async () => {
      // Arrange
      const email = 'a@example.com';
      userRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findByEmail(email);

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email, deletedAt: IsNull() },
      });
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      // Arrange
      const id = '1';
      const dto: UpdateUserDto = { nombre: 'Nuevo' };
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(id, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('debe actualizar nombre y email cuando el usuario existe', async () => {
      // Arrange
      const id = '1';
      const existingUser: User = {
        id,
        nombre: 'Viejo',
        email: 'old@example.com',
        passwordHash: 'hash',
        deletedAt: null,
      } as User;

      const dto: UpdateUserDto = {
        nombre: 'Nuevo',
        email: 'new@example.com',
      };

      userRepository.findOne
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);

      const savedUser: User = {
        ...existingUser,
        nombre: dto.nombre ?? existingUser.nombre,
        email: dto.email ?? existingUser.email,
      };
      userRepository.save.mockResolvedValue(savedUser);

      // Act
      const result = await service.update(id, dto);

      // Assert
      expect(userRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { id, deletedAt: IsNull() },
      });
      expect(userRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { email: dto.email, deletedAt: IsNull() },
      });
      expect(result.nombre).toBe(dto.nombre);
      expect(result.email).toBe(dto.email);
      expect(userRepository.save).toHaveBeenCalledWith(savedUser);
    });

    it('debe lanzar ConflictException si el email ya está en uso por otro usuario', async () => {
      // Arrange
      const id = '1';
      const existingUser: User = {
        id,
        nombre: 'Viejo',
        email: 'old@example.com',
        passwordHash: 'hash',
        deletedAt: null,
      } as User;

      const dto: UpdateUserDto = {
        email: 'new@example.com',
      };

      const otherUser: User = {
        id: '2',
        nombre: 'Otro',
        email: dto.email,
        passwordHash: 'hash2',
        deletedAt: null,
      } as User;

      userRepository.findOne
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(otherUser);

      // Act & Assert
      await expect(service.update(id, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si la nueva contraseña está vacía', async () => {
      // Arrange
      const id = '1';
      const existingUser: User = {
        id,
        nombre: 'Viejo',
        email: 'old@example.com',
        passwordHash: 'hash',
        deletedAt: null,
      } as User;

      const dto: UpdateUserDto = {
        contraseña: '',
      };

      userRepository.findOne.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.update(id, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(bcryptHashSpy).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si la nueva contraseña es demasiado corta', async () => {
      // Arrange
      const id = '1';
      const existingUser: User = {
        id,
        nombre: 'Viejo',
        email: 'old@example.com',
        passwordHash: 'hash',
        deletedAt: null,
      } as User;

      const dto: UpdateUserDto = {
        contraseña: 'short',
      };

      userRepository.findOne.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.update(id, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(bcryptHashSpy).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('debe actualizar la contraseña cuando es válida', async () => {
      // Arrange
      const id = '1';
      const existingUser: User = {
        id,
        nombre: 'Viejo',
        email: 'old@example.com',
        passwordHash: 'hash',
        deletedAt: null,
      } as User;

      const dto: UpdateUserDto = {
        contraseña: 'passwordNuevo',
      };

      userRepository.findOne.mockResolvedValue(existingUser);
      bcryptHashSpy.mockResolvedValue('nuevo-hash' as never);

      const savedUser: User = {
        ...existingUser,
        passwordHash: 'nuevo-hash',
      };

      userRepository.save.mockResolvedValue(savedUser);

      // Act
      const result = await service.update(id, dto);

      // Assert
      expect(bcryptHashSpy).toHaveBeenCalledWith(dto.contraseña, 10);
      expect(result.passwordHash).toBe('nuevo-hash');
      expect(userRepository.save).toHaveBeenCalledWith(savedUser);
    });
  });

  describe('remove', () => {
    it('debe eliminar lógicamente un usuario existente', async () => {
      // Arrange
      const id = '1';
      const softDeleteResult: SoftDeleteResult = { affected: 1 };
      userRepository.softDelete.mockResolvedValue(
        softDeleteResult as SoftDeleteResult,
      );

      // Act
      await service.remove(id);

      // Assert
      expect(userRepository.softDelete).toHaveBeenCalledWith(id);
    });

    it('debe lanzar NotFoundException si no se afecta ningún registro', async () => {
      // Arrange
      const id = '1';
      const softDeleteResult: SoftDeleteResult = { affected: 0 };
      userRepository.softDelete.mockResolvedValue(
        softDeleteResult as SoftDeleteResult,
      );

      // Act & Assert
      await expect(service.remove(id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

