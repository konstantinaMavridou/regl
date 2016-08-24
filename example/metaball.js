/*
  <p>Metaball rendering demo. Many ideas and code taken from <a href="https://www.clicktorelease.com/code/bumpy-metaballs">here</a></p>

 */

const regl = require('../regl')()
const isosurface = require("isosurface")
const normals = require('angle-normals')
const mat3 = require("gl-mat3")
const camera = require('./util/camera')(regl, {
  distance: 1,
  maxDistance: 3,
  minDistance: 0.5,
  center: [0.5,0.5,0.5],
})

const drawMetaballs = regl({
  vert: `
    precision mediump float;
    uniform mat4 projection, view;
    uniform mat3 normalMatrix;
    attribute vec3 position, normal;
    varying vec3 vNormal, vONormal, vU;
    varying vec4 vPosition, vOPosition;
    void main () {
      vNormal = normalMatrix * normal;
      vONormal = normal;
      vPosition = vec4( position, 1.0 );
      vOPosition = view * vPosition;
      vU = normalize( vec3( vOPosition ) );
      gl_Position = projection * vOPosition;
    }`,
  frag: `
    precision mediump float;
    uniform sampler2D textureMap, normalMap;
    uniform vec3 color, eye;
    uniform float normalScale, texScale, useSSS, useScreen;

    varying vec3 vNormal, vONormal, vU;
    varying vec4 vPosition, vOPosition;

    float random(vec3 scale,float seed) {
      return fract(sin(dot(gl_FragCoord.xyz+seed,scale))*43758.5453+seed);
    }

    void main() {
      vec3 n = normalize( vONormal.xyz );
      vec3 blend_weights = abs( n );
      blend_weights = ( blend_weights - 0.2 ) * 7.;
      blend_weights = max( blend_weights, 0. );
      blend_weights /= ( blend_weights.x + blend_weights.y + blend_weights.z );

      vec2 coord1 = vPosition.yz * texScale;
      vec2 coord2 = vPosition.zx * texScale;
      vec2 coord3 = vPosition.xy * texScale;

      vec3 bump1 = texture2D( normalMap, coord1 ).rgb;
      vec3 bump2 = texture2D( normalMap, coord2 ).rgb;
      vec3 bump3 = texture2D( normalMap, coord3 ).rgb;

      vec3 blended_bump = bump1 * blend_weights.xxx +
                          bump2 * blend_weights.yyy +
                          bump3 * blend_weights.zzz;

      vec3 tanX = vec3( vNormal.x, -vNormal.z, vNormal.y);
      vec3 tanY = vec3( vNormal.z, vNormal.y, -vNormal.x);
      vec3 tanZ = vec3(-vNormal.y, vNormal.x, vNormal.z);
      vec3 blended_tangent = tanX * blend_weights.xxx +
                             tanY * blend_weights.yyy +
                             tanZ * blend_weights.zzz;

      vec3 normalTex = blended_bump * 2.0 - 1.0;
      normalTex.xy *= normalScale;
      normalTex.y *= -1.;
      normalTex = normalize( normalTex );
      mat3 tsb = mat3( normalize( blended_tangent ), normalize( cross( vNormal, blended_tangent ) ), normalize( vNormal ) );
      vec3 finalNormal = tsb * normalTex;

      vec3 r = reflect( normalize( vU ), normalize( finalNormal ) );
      float m = 2.0 * sqrt( r.x * r.x + r.y * r.y + ( r.z + 1.0 ) * ( r.z + 1.0 ) );
      vec2 calculatedNormal = vec2( r.x / m + 0.5,  r.y / m + 0.5 );

      vec3 base = texture2D( textureMap, calculatedNormal ).rgb;

      float rim = 1.75 * max( 0., abs( dot( normalize( vNormal ), normalize( -vOPosition.xyz ) ) ) );
      base += useSSS * color * ( 1. - .75 * rim );
      base += ( 1. - useSSS ) * 10. * base * color * clamp( 1. - rim, 0., .15 );

      if( useScreen == 1. ) {
        base = vec3( 1. ) - ( vec3( 1. ) - base ) * ( vec3( 1. ) - base );
      }

      float nn = .05 * random( vec3( 1. ), length( gl_FragCoord ) );
      base += vec3( nn );

      gl_FragColor = vec4( base.rgb, 1. );
    }`,
  attributes: {
    position: regl.prop('positions'),
    normal: (context, props) => normals(props.cells, props.positions)
  },
  uniforms: {
    color: [36/255.0, 70/255.0, 106/255.0],
    sphereColor: [36/255.0, 70/255.0, 106/255.0],
    normalScale: 1,
    texScale: 10,
    useSSS: 0,
    useScreen: 1,
    normalMatrix: (context) => {
      let a = mat3.create()
      mat3.normalFromMat4(a, context.view)
      return a
    },
    textureMap: regl.prop('textureMap'),
    normalMap: regl.prop('normalMap')
  },
  elements: regl.prop('cells')
})

const metaball = (px, py, pz, strength, subtract) => {
  return (x, y, z) => {
    return (strength / (Math.pow(x-px, 2) + Math.pow(y-py, 2) + Math.pow(z-pz, 2))) - subtract
  }
}

const numblobs = 20
const strength = 1.2 / ( ( Math.sqrt( numblobs ) - 1 ) / 4 + 1 )
const subtract = 12
const balls = Array(numblobs).fill().map((_, i) => {
  return (time) => {
    ballx = Math.sin( i + 1.26 * time * ( 1.03 + 0.5 * Math.cos( 0.21 * i ) ) ) * 0.27 + 0.5;
    bally = Math.cos( i + 1.12 * time * 0.21 * Math.sin( ( 0.72 + 0.83 * i ) ) ) * 0.27 + 0.5;
    ballz = Math.cos( i + 1.32 * time * 0.1 * Math.sin( ( 0.92 + 0.53 * i ) ) ) * 0.27 + 0.5;
    return metaball(ballx, bally, ballz, strength, subtract)
  }
})

require('resl')({
  manifest: {
    sphereTexture: {
      type: 'image',
      src: 'spheretexture.jpg',
      parser: (data) => regl.texture({
        data: data,
        wrapT: 'clamp',
        wrapS: 'clamp'
      })
    },
    normalTexture: {
      type: 'image',
      src: 'normaltexture.jpg',
      parser: (data) => regl.texture({
        data: data,
        wrapT: "repeat",
        wrapS: "repeat"
      })
    }
  },
  onDone: ({ sphereTexture, normalTexture }) => {
    let time = 0.05
    let field = (x,y,z) => {
      return balls.map((b) => b(1)(x,y,z)).reduce((a, b) => a + b)
    }
    let mesh = isosurface.surfaceNets([50,50,50], field, [[0,0,0], [1, 1, 1]])

    regl.frame(({tick}) => {
      // let time = 0.05 * tick
      // let field = (x,y,z) => {
      //   return balls.map((b) => b(time)(x,y,z)).reduce((a, b) => a + b)
      // }
      // let mesh = isosurface.surfaceNets([50,50,50], field, [[0,0,0], [1, 1, 1]])
      camera(() => {
        drawMetaballs({
          positions: mesh.positions,
          cells: mesh.cells,
          textureMap: sphereTexture,
          normalMap: normalTexture
        })
      })
    })
  }
})
