// tests/merkle-tree.test.js

import { describe, it, expect } from 'vitest';
import { MerkleTree } from '../src/js/core/audit/merkle-tree.js';
import { CryptoUtils } from '../src/js/core/crypto-utils.js';

describe('MerkleTree', () => {
  
  // ============ CONSTRUCTOR ============
  describe('Constructor', () => {
    it('debe crear un árbol vacío', () => {
      const tree = new MerkleTree([]);
      expect(tree.size()).toBe(0);
      expect(tree.getRoot()).toBeNull();
    });

    it('debe crear un árbol con un solo leaf', () => {
      const tree = new MerkleTree(['hash_a']);
      expect(tree.size()).toBe(1);
      expect(tree.getRoot()).toBe('hash_a');
      expect(tree.height()).toBe(1);
    });

    it('debe crear un árbol con múltiples leaves', () => {
      const tree = new MerkleTree(['a', 'b', 'c', 'd']);
      expect(tree.size()).toBe(4);
      expect(tree.height()).toBeGreaterThan(1);
      expect(tree.getRoot()).toBeDefined();
    });

    it('no debe modificar el array de leaves original', () => {
      const original = ['a', 'b'];
      const tree = new MerkleTree(original);
      tree.leaves.push('c');
      expect(original.length).toBe(2);
    });
  });

  // ============ FROM DATA ============
  describe('fromData', () => {
    it('debe crear un árbol desde datos crudos', async () => {
      const data = [{ name: 'A' }, { name: 'B' }];
      const tree = await MerkleTree.fromData(data);
      
      expect(tree.size()).toBe(2);
      expect(tree.getRoot()).toBeDefined();
    });

    it('debe producir el mismo root para los mismos datos', async () => {
      const data = [{ name: 'A' }, { name: 'B' }];
      const tree1 = await MerkleTree.fromData(data);
      const tree2 = await MerkleTree.fromData(data);
      
      expect(tree1.getRoot()).toBe(tree2.getRoot());
    });

    it('debe producir roots diferentes para datos diferentes', async () => {
      const tree1 = await MerkleTree.fromData([{ name: 'A' }]);
      const tree2 = await MerkleTree.fromData([{ name: 'B' }]);
      
      expect(tree1.getRoot()).not.toBe(tree2.getRoot());
    });

    it('debe lanzar error si no es un array', async () => {
      await expect(MerkleTree.fromData('not an array')).rejects.toThrow();
      await expect(MerkleTree.fromData(null)).rejects.toThrow();
    });
  });

  // ============ GET PROOF ============
  describe('getProof', () => {
    it('debe generar una prueba para un árbol de 4 elementos', () => {
      const tree = new MerkleTree(['a', 'b', 'c', 'd']);
      const proof = tree.getProof(0);
      
      expect(Array.isArray(proof)).toBe(true);
      expect(proof.length).toBeGreaterThan(0);
      
      proof.forEach(step => {
        expect(step).toHaveProperty('position');
        expect(step).toHaveProperty('hash');
        expect(['left', 'right']).toContain(step.position);
      });
    });

    it('debe generar pruebas diferentes para índices diferentes', () => {
      const tree = new MerkleTree(['a', 'b', 'c', 'd']);
      const proof0 = tree.getProof(0);
      const proof1 = tree.getProof(1);
      
      expect(JSON.stringify(proof0)).not.toBe(JSON.stringify(proof1));
    });

    it('debe lanzar error para índice fuera de rango', () => {
      const tree = new MerkleTree(['a', 'b']);
      expect(() => tree.getProof(-1)).toThrow();
      expect(() => tree.getProof(5)).toThrow();
    });
  });

  // ============ VERIFY PROOF ============
  describe('verifyProof', () => {
    it('debe verificar una prueba válida', () => {
      const tree = new MerkleTree(['a', 'b', 'c', 'd']);
      const root = tree.getRoot();
      const proof = tree.getProof(2);
      
      const valid = MerkleTree.verifyProof('c', proof, root);
      expect(valid).toBe(true);
    });

    it('debe rechazar una prueba inválida', () => {
      const tree = new MerkleTree(['a', 'b', 'c', 'd']);
      const root = tree.getRoot();
      const proof = tree.getProof(0);
      
      // Verificar con un leaf incorrecto
      const valid = MerkleTree.verifyProof('fake_leaf', proof, root);
      expect(valid).toBe(false);
    });

    it('debe rechazar una prueba con root incorrecto', () => {
      const tree = new MerkleTree(['a', 'b', 'c', 'd']);
      const proof = tree.getProof(0);
      
      const valid = MerkleTree.verifyProof('a', proof, 'wrong_root');
      expect(valid).toBe(false);
    });
  });

  // ============ VERIFY ============
  describe('verify', () => {
    it('debe verificar un árbol íntegro', () => {
      const tree = new MerkleTree(['a', 'b', 'c', 'd']);
      expect(tree.verify()).toBe(true);
    });

    it('debe detectar manipulación de leaves', () => {
	  const tree = new MerkleTree(['a', 'b', 'c', 'd']);
	  tree.leaves[0] = 'tampered';
	  // verify() reconstruye desde los leaves actuales y compara con
	  // el root anterior. Como cambió un leaf, el root es diferente → detecta manipulación.
	  expect(tree.verify()).toBe(false);
	});
	it('debe verificar un árbol sin manipulación', () => {
	  const tree = new MerkleTree(['a', 'b', 'c', 'd']);
	  expect(tree.verify()).toBe(true);
	});
  });

  // ============ SERIALIZACIÓN ============
  describe('toJSON / fromJSON', () => {
    it('debe serializar y deserializar correctamente', () => {
      const original = new MerkleTree(['a', 'b', 'c', 'd']);
      const json = original.toJSON();
      
      expect(json).toHaveProperty('leaves');
      expect(json).toHaveProperty('levels');
      expect(json).toHaveProperty('root');
      
      const restored = MerkleTree.fromJSON(json);
      expect(restored.getRoot()).toBe(original.getRoot());
      expect(restored.size()).toBe(original.size());
    });
  });

  // ============ CASOS ESPECIALES ============
  describe('Casos especiales', () => {
    it('debe manejar número impar de leaves', () => {
      const tree = new MerkleTree(['a', 'b', 'c']);
      expect(tree.size()).toBe(3);
      expect(tree.getRoot()).toBeDefined();
    });

    it('debe manejar un solo leaf', () => {
      const tree = new MerkleTree(['solo']);
      expect(tree.getRoot()).toBe('solo');
      expect(tree.height()).toBe(1);
    });

    it('debe manejar strings largos', () => {
      const longHash = 'a'.repeat(64);
      const tree = new MerkleTree([longHash, longHash]);
      expect(tree.getRoot()).toBeDefined();
    });
  });
});