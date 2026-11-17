/*
 CG1 Balon en 2D hecho con triangulos
Gonzalo Zamarrón Orrantia
 */

'use strict';

import * as twgl from 'twgl-base.js';
import GUI from 'lil-gui';
import { diamond } from '../libs/shapes.js';
import { V2, M3, type Vec2, type Mat3 } from '../libs/2d-lib.js';
import { Scene } from '../libs/scene.js';

// Shaders en archivos separados (los mismos que usa 08_smiley)
import vsGLSL from './vs_matrices_vcolor.glsl?raw';
import fsGLSL from './fs_vertex_color.glsl?raw';


// Los ordenes que pide el objetivo 4
const ORDERS = [
    'scale -> rotation -> translation',
    'scale -> translation -> rotation',
    'translation -> scale -> rotation',
    'rotation -> translation -> scale',
    'rotation -> scale -> translation',
];


/*
 Mi balon, igual que la funcion smiley() de shapes.ts pero con mis propios triangulos
 */
function myBall(pixelSize: number): twgl.Arrays {
    const positionData: number[] = [];
    const colorData: number[] = [];
    const indexData: number[] = [];

    // dibujo del balon, cada letra es un pixel
    // b = cafe, w = blanco, . = vacio
    const grid = [
        '.....bbbbb.....',
        '..bbbbbbbbbbb..',
        '.bbbbwbwbwbbbb.',
        'bbbbwwwwwwwbbbb',
        '.bbbbwbwbwbbbb.',
        '..bbbbbbbbbbb..',
        '.....bbbbb.....',
    ];

    const brown = [0.55, 0.27, 0.07, 1];
    const white = [1, 1, 1, 1];

    // para que el balon quede centrado en (0, 0)
    const width = grid[0].length * pixelSize;
    const height = grid.length * pixelSize;

    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            const letter = grid[row][col];
            if (letter == '.') continue;

            // esquina de abajo a la izquierda del pixel
            // la fila 0 es la de arriba, por eso se resta
            const x = col * pixelSize - width / 2;
            const y = height / 2 - (row + 1) * pixelSize;

            // cada pixel es un cuadrado = 2 triangulos
            const start = positionData.length / 2;
            positionData.push(x, y);
            positionData.push(x + pixelSize, y);
            positionData.push(x + pixelSize, y + pixelSize);
            positionData.push(x, y + pixelSize);

            const color = letter == 'w' ? white : brown;
            colorData.push(...color, ...color, ...color, ...color);

            indexData.push(start, start + 1, start + 2);
            indexData.push(start, start + 2, start + 3);
        }
    }

    const arrays: twgl.Arrays = {
        a_position: { numComponents: 2, data: positionData },
        a_color:    { numComponents: 4, data: colorData },
        indices:    { numComponents: 3, data: indexData },
    };

    return arrays;
}


class BallScene extends Scene {
    // el orden que se elige en el drop-down
    order: string = ORDERS[1];

    constructor(gl: WebGL2RenderingContext) {
        super(gl, vsGLSL, fsGLSL);

        // cada objeto tiene su propio VAO (addObject lo crea en Object3D)
        const model = this.addObject('model', myBall(20), [0.55, 0.27, 0.07, 1]);
        model.transforms.t.x = gl.canvas.width / 2;
        model.transforms.t.y = gl.canvas.height / 2;

        // el pivote es el diamante de shapes.ts
        const pivot = this.addObject('pivot', diamond(20), [0.5, 0.5, 0.5, 1]);
        pivot.transforms.t.x = gl.canvas.width / 4;
        pivot.transforms.t.y = gl.canvas.height / 2;
    }

    protected render(): void {
        const { gl, programInfo } = this;
        const model = this.getObject('model');
        const pivot = this.getObject('pivot');

        // fondo blanco
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // vectores igual que en 08_smiley
        const v2_trans: Vec2 = V2.create(model.transforms.t.x, model.transforms.t.y);
        const v2_scale: Vec2 = V2.create(model.transforms.s.x, model.transforms.s.y);
        const v2_pivot_to_center: Vec2 = V2.create(-pivot.transforms.t.x,
                                                   -pivot.transforms.t.y);
        const v2_center_to_pivot: Vec2 = V2.create(pivot.transforms.t.x,
                                                   pivot.transforms.t.y);

        // matrices del balon (con las funciones que hice en 2d-lib.ts)
        const scaMat: Mat3 = M3.scale(v2_scale);
        const traMat: Mat3 = M3.translation(v2_trans);
        const rotMat: Mat3 = M3.rotation(model.transforms.rr.z);

        // para rotar alrededor del pivote:
        // llevo el pivote al origen, roto, y lo regreso a su lugar
        const toCenter: Mat3 = M3.translation(v2_pivot_to_center);
        const toPivot: Mat3 = M3.translation(v2_center_to_pivot);
        const rotPivotMat: Mat3 = M3.multiply(toPivot, M3.multiply(rotMat, toCenter));

        const matrices: { [name: string]: Mat3 } = {
            'scale': scaMat,
            'rotation': rotPivotMat,
            'translation': traMat,
        };

        // armo la matriz en el orden del drop-down
        // cada nueva se multiplica a la izquierda porque se aplica despues
        let modelTransforms: Mat3 = M3.identity();
        for (const name of this.order.split(' -> ')) {
            modelTransforms = M3.multiply(matrices[name], modelTransforms);
        }

        gl.useProgram(programInfo.program);

        // dibujar el balon
        let uniforms = {
            u_resolution: [gl.canvas.width, gl.canvas.height],
            u_transforms: modelTransforms,
        };
        twgl.setUniforms(programInfo, uniforms);
        gl.bindVertexArray(model.vao);
        twgl.drawBufferInfo(gl, model.bufferInfo);

        // el pivote solo se traslada (igual que en 08_smiley)
        const pivotTransforms: Mat3 = M3.translation(v2_center_to_pivot);

        uniforms = {
            u_resolution: [gl.canvas.width, gl.canvas.height],
            u_transforms: pivotTransforms,
        };
        twgl.setUniforms(programInfo, uniforms);
        gl.bindVertexArray(pivot.vao);
        twgl.drawBufferInfo(gl, pivot.bufferInfo);
    }

    setupUI(): void {
        const { gl } = this;
        const model = this.getObject('model');
        const pivot = this.getObject('pivot');

        const gui = new GUI();

        // drop-down para el orden (objetivo 4)
        gui.add(this, 'order', ORDERS).name('Order');

        const modelFolder = gui.addFolder('Model');

        const traFolder = modelFolder.addFolder('Translation');
        traFolder.add(model.transforms.t, 'x', 0, gl.canvas.width);
        traFolder.add(model.transforms.t, 'y', 0, gl.canvas.height);

        const rotFolder = modelFolder.addFolder('Rotation');
        rotFolder.add(model.transforms.rr, 'z', 0, Math.PI * 2);

        const scaFolder = modelFolder.addFolder('Scale');
        scaFolder.add(model.transforms.s, 'x', -5, 5);
        scaFolder.add(model.transforms.s, 'y', -5, 5);

        const pivotFolder = gui.addFolder('Pivot');
        const pivotTraFolder = pivotFolder.addFolder('Translation');
        pivotTraFolder.add(pivot.transforms.t, 'x', 0, gl.canvas.width);
        pivotTraFolder.add(pivot.transforms.t, 'y', 0, gl.canvas.height);
    }
}

function main(): void {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas element found in the document');
    }

    const gl = canvas.getContext('webgl2');
    if (!gl) {
        throw new Error('WebGL2 is not supported by this browser');
    }

    const scene = new BallScene(gl);
    scene.setupUI();
    scene.draw(0);
}

main()