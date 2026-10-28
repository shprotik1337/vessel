import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const KAWASE_BLUR_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_offset;
  varying vec2 v_texCoord;

  void main() {
    highp vec2 texelSize = 1.0 / u_resolution;
    highp vec4 color = vec4(0.0);

    color += texture2D(u_texture, v_texCoord + vec2(-u_offset, -u_offset) * texelSize);
    color += texture2D(u_texture, v_texCoord + vec2(u_offset, -u_offset) * texelSize);
    color += texture2D(u_texture, v_texCoord + vec2(-u_offset, u_offset) * texelSize);
    color += texture2D(u_texture, v_texCoord + vec2(u_offset, u_offset) * texelSize);

    gl_FragColor = color * 0.25;
  }
`;

const BLEND_SHADER = `
  precision highp float;
  uniform sampler2D u_texture1;
  uniform sampler2D u_texture2;
  uniform float u_blend;
  varying vec2 v_texCoord;

  void main() {
    vec4 color1 = texture2D(u_texture1, v_texCoord);
    vec4 color2 = texture2D(u_texture2, v_texCoord);
    gl_FragColor = mix(color1, color2, u_blend);
  }
`;

const TINT_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform vec3 u_tintColor;
  uniform float u_tintIntensity;
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float darkMask = 1.0 - smoothstep(0.0, 0.5, luma);
    color.rgb = mix(color.rgb, u_tintColor, darkMask * u_tintIntensity);
    gl_FragColor = color;
  }
`;

const DOMAIN_WARP_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_intensity;
  varying vec2 v_texCoord;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = v_texCoord;
    float t = u_time * 0.08;

    vec2 q = vec2(
      snoise(uv * 0.5 + vec2(t * 0.6, t * 0.4)),
      snoise(uv * 0.5 + vec2(-t * 0.5, t * 0.7) + vec2(43.12, 17.89))
    );

    vec2 r = vec2(
      snoise(uv * 1.1 + q * 0.7 + vec2(t * 0.3, -t * 0.5) + vec2(12.34, 56.78)),
      snoise(uv * 1.1 + q * 0.7 + vec2(-t * 0.4, t * 0.6) + vec2(98.76, 54.32))
    );

    vec2 warpedUv = uv + r * (0.12 * u_intensity);
    gl_FragColor = texture2D(u_texture, warpedUv);
  }
`;

const OUTPUT_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform float u_saturation;
  uniform float u_dithering;
  uniform float u_time;
  uniform float u_scale;
  uniform vec2 u_resolution;
  varying vec2 v_texCoord;

  highp float hash(highp vec3 p) {
    p = fract(p * 0.1031);
    p += vec3(dot(p, p.zyx + 31.32));
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec2 uv = (v_texCoord - 0.5) / u_scale + 0.5;
    uv = clamp(uv, 0.0, 1.0);

    vec4 color = texture2D(u_texture, uv);

    vec2 center = v_texCoord - 0.5;
    float vignette = 1.0 - dot(center, center) * 0.25;
    color.rgb *= vignette;

    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(gray), color.rgb, u_saturation);

    highp vec2 pixelPos = floor(v_texCoord * u_resolution);
    highp float noise = hash(vec3(pixelPos, floor(u_time * 60.0)));
    color.rgb += (noise - 0.5) * u_dithering;

    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

const BLUR_SIZE = 128;

interface FBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

class KawarpEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private animationId: number | null = null;
  private lastFrameTime = 0;
  private accumulatedTime = 0;
  private isPlaying = false;
  private isTransitioning = false;
  private transitionStartTime = 0;
  private transitionDuration = 1000;
  private loadSequenceId = 0;
  private warpIntensity = 1.1;
  private blurPasses = 8;
  private animationSpeed = 0.9;
  private saturation = 1.35;
  private tintColor = [0.157, 0.157, 0.235];
  private tintIntensity = 0.15;
  private dithering = 0.008;
  private scale = 1.18;
  private hasImage = false;

  private blurProgram!: WebGLProgram;
  private blendProgram!: WebGLProgram;
  private tintProgram!: WebGLProgram;
  private warpProgram!: WebGLProgram;
  private outputProgram!: WebGLProgram;

  private positionBuffer!: WebGLBuffer;
  private texCoordBuffer!: WebGLBuffer;
  private sourceTexture!: WebGLTexture;

  private blurFBO1!: FBO;
  private blurFBO2!: FBO;
  private currentAlbumFBO!: FBO;
  private nextAlbumFBO!: FBO;
  private transitionFBO!: FBO;
  private warpFBO!: FBO;

  private uniforms!: {
    blur: { resolution: WebGLUniformLocation | null; texture: WebGLUniformLocation | null; offset: WebGLUniformLocation | null };
    blend: { texture1: WebGLUniformLocation | null; texture2: WebGLUniformLocation | null; blend: WebGLUniformLocation | null };
    warp: { texture: WebGLUniformLocation | null; time: WebGLUniformLocation | null; intensity: WebGLUniformLocation | null };
    tint: { texture: WebGLUniformLocation | null; tintColor: WebGLUniformLocation | null; tintIntensity: WebGLUniformLocation | null };
    output: { texture: WebGLUniformLocation | null; saturation: WebGLUniformLocation | null; dithering: WebGLUniformLocation | null; time: WebGLUniformLocation | null; scale: WebGLUniformLocation | null; resolution: WebGLUniformLocation | null };
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    this.blurProgram = this.createProgram(VERTEX_SHADER, KAWASE_BLUR_SHADER);
    this.blendProgram = this.createProgram(VERTEX_SHADER, BLEND_SHADER);
    this.tintProgram = this.createProgram(VERTEX_SHADER, TINT_SHADER);
    this.warpProgram = this.createProgram(VERTEX_SHADER, DOMAIN_WARP_SHADER);
    this.outputProgram = this.createProgram(VERTEX_SHADER, OUTPUT_SHADER);

    this.uniforms = {
      blur: {
        resolution: gl.getUniformLocation(this.blurProgram, "u_resolution"),
        texture: gl.getUniformLocation(this.blurProgram, "u_texture"),
        offset: gl.getUniformLocation(this.blurProgram, "u_offset"),
      },
      blend: {
        texture1: gl.getUniformLocation(this.blendProgram, "u_texture1"),
        texture2: gl.getUniformLocation(this.blendProgram, "u_texture2"),
        blend: gl.getUniformLocation(this.blendProgram, "u_blend"),
      },
      warp: {
        texture: gl.getUniformLocation(this.warpProgram, "u_texture"),
        time: gl.getUniformLocation(this.warpProgram, "u_time"),
        intensity: gl.getUniformLocation(this.warpProgram, "u_intensity"),
      },
      tint: {
        texture: gl.getUniformLocation(this.tintProgram, "u_texture"),
        tintColor: gl.getUniformLocation(this.tintProgram, "u_tintColor"),
        tintIntensity: gl.getUniformLocation(this.tintProgram, "u_tintIntensity"),
      },
      output: {
        texture: gl.getUniformLocation(this.outputProgram, "u_texture"),
        saturation: gl.getUniformLocation(this.outputProgram, "u_saturation"),
        dithering: gl.getUniformLocation(this.outputProgram, "u_dithering"),
        time: gl.getUniformLocation(this.outputProgram, "u_time"),
        scale: gl.getUniformLocation(this.outputProgram, "u_scale"),
        resolution: gl.getUniformLocation(this.outputProgram, "u_resolution"),
      },
    };

    this.positionBuffer = this.createBuffer(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
    this.texCoordBuffer = this.createBuffer(new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]));
    this.sourceTexture = this.createTexture();

    this.blurFBO1 = this.createFramebuffer(BLUR_SIZE, BLUR_SIZE);
    this.blurFBO2 = this.createFramebuffer(BLUR_SIZE, BLUR_SIZE);
    this.currentAlbumFBO = this.createFramebuffer(BLUR_SIZE, BLUR_SIZE);
    this.nextAlbumFBO = this.createFramebuffer(BLUR_SIZE, BLUR_SIZE);
    this.transitionFBO = this.createFramebuffer(BLUR_SIZE, BLUR_SIZE);

    const r = Math.max(1, Math.round((canvas.width || 640) * 0.5));
    const i = Math.max(1, Math.round((canvas.height || 360) * 0.5));
    this.warpFBO = this.createFramebuffer(r, i);
  }

  public resize() {
    const w = Math.max(1, Math.round(this.canvas.width * 0.5));
    const h = Math.max(1, Math.round(this.canvas.height * 0.5));
    if (this.warpFBO.width !== w || this.warpFBO.height !== h) {
      this.deleteFramebuffer(this.warpFBO);
      this.warpFBO = this.createFramebuffer(w, h);
    }
    if (this.hasImage) {
      this.render(this.accumulatedTime, performance.now());
    }
  }

  public async loadImage(url: string) {
    if (!url) return;
    const seq = ++this.loadSequenceId;
    let imgBitmap: ImageBitmap | HTMLImageElement | null = null;

    try {
      const resp = await fetch(url, { mode: "cors" });
      if (resp.ok) {
        const blob = await resp.blob();
        imgBitmap = await createImageBitmap(blob);
      }
    } catch {
      // Fallback to standard Image
    }

    if (!imgBitmap) {
      try {
        imgBitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Image load error"));
          img.src = url;
        });
      } catch {
        return;
      }
    }

    if (seq !== this.loadSequenceId) {
      if (imgBitmap && "close" in imgBitmap && typeof imgBitmap.close === "function") {
        imgBitmap.close();
      }
      return;
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgBitmap);

    if (imgBitmap && "close" in imgBitmap && typeof imgBitmap.close === "function") {
      imgBitmap.close();
    }

    this.processNewImage();
  }

  private processNewImage() {
    if (!this.hasImage) {
      this.blurSourceInto(this.nextAlbumFBO);
      this.blurSourceInto(this.currentAlbumFBO);
      this.hasImage = true;
      this.isTransitioning = false;
      return;
    }
    const temp = this.currentAlbumFBO;
    this.currentAlbumFBO = this.nextAlbumFBO;
    this.nextAlbumFBO = temp;
    this.blurSourceInto(this.nextAlbumFBO);
    this.isTransitioning = true;
    this.transitionStartTime = performance.now();
  }

  private blurSourceInto(targetFBO: FBO) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // 1. Tint pass
    gl.useProgram(this.tintProgram);
    this.setupAttributes();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO1.framebuffer);
    gl.viewport(0, 0, BLUR_SIZE, BLUR_SIZE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.uniform1i(this.uniforms.tint.texture, 0);
    gl.uniform3fv(this.uniforms.tint.tintColor, this.tintColor);
    gl.uniform1f(this.uniforms.tint.tintIntensity, this.tintIntensity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 2. Multi-pass Kawase blur
    gl.useProgram(this.blurProgram);
    this.setupAttributes();
    gl.uniform2f(this.uniforms.blur.resolution, BLUR_SIZE, BLUR_SIZE);
    gl.uniform1i(this.uniforms.blur.texture, 0);

    let src = this.blurFBO1;
    let dst = this.blurFBO2;
    for (let i = 0; i < this.blurPasses; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
      gl.viewport(0, 0, BLUR_SIZE, BLUR_SIZE);
      gl.bindTexture(gl.TEXTURE_2D, src.texture);
      gl.uniform1f(this.uniforms.blur.offset, i + 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const temp = src;
      src = dst;
      dst = temp;
    }

    // 3. Copy to destination
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.framebuffer);
    gl.viewport(0, 0, BLUR_SIZE, BLUR_SIZE);
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    gl.uniform1f(this.uniforms.blur.offset, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public start() {
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.lastFrameTime = performance.now();
      this.animationId = requestAnimationFrame(this.renderLoop);
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private renderLoop = (time: number) => {
    if (!this.isPlaying) return;
    const delta = (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;
    this.accumulatedTime += delta * this.animationSpeed;
    this.render(this.accumulatedTime, time);
    this.animationId = requestAnimationFrame(this.renderLoop);
  };

  private render(accTime: number, now = performance.now()) {
    if (!this.hasImage) return;
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const halfW = Math.max(1, Math.round(w * 0.5));
    const halfH = Math.max(1, Math.round(h * 0.5));

    if (this.warpFBO.width !== halfW || this.warpFBO.height !== halfH) {
      this.deleteFramebuffer(this.warpFBO);
      this.warpFBO = this.createFramebuffer(halfW, halfH);
    }

    let progress = 1;
    if (this.isTransitioning) {
      const elapsed = now - this.transitionStartTime;
      progress = Math.min(1, elapsed / this.transitionDuration);
      if (progress >= 1) {
        this.isTransitioning = false;
      }
    }

    let activeTex: WebGLTexture;
    if (this.isTransitioning && progress < 1) {
      gl.useProgram(this.blendProgram);
      this.setupAttributes();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.transitionFBO.framebuffer);
      gl.viewport(0, 0, BLUR_SIZE, BLUR_SIZE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.currentAlbumFBO.texture);
      gl.uniform1i(this.uniforms.blend.texture1, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.nextAlbumFBO.texture);
      gl.uniform1i(this.uniforms.blend.texture2, 1);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      gl.uniform1f(this.uniforms.blend.blend, ease);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      activeTex = this.transitionFBO.texture;
    } else {
      activeTex = this.nextAlbumFBO.texture;
    }

    // Warp pass
    gl.useProgram(this.warpProgram);
    this.setupAttributes();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.warpFBO.framebuffer);
    gl.viewport(0, 0, halfW, halfH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, activeTex);
    gl.uniform1i(this.uniforms.warp.texture, 0);
    gl.uniform1f(this.uniforms.warp.time, accTime);
    gl.uniform1f(this.uniforms.warp.intensity, this.warpIntensity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Final screen output pass
    gl.useProgram(this.outputProgram);
    this.setupAttributes();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.warpFBO.texture);
    gl.uniform1i(this.uniforms.output.texture, 0);
    gl.uniform1f(this.uniforms.output.saturation, this.saturation);
    gl.uniform1f(this.uniforms.output.dithering, this.dithering);
    gl.uniform1f(this.uniforms.output.time, accTime);
    gl.uniform1f(this.uniforms.output.scale, this.scale);
    gl.uniform2f(this.uniforms.output.resolution, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private setupAttributes() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  }

  private createShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("Shader compile error: " + err);
    }
    return shader;
  }

  private createProgram(vSrc: string, fSrc: string): WebGLProgram {
    const gl = this.gl;
    const vShader = this.createShader(gl.VERTEX_SHADER, vSrc);
    const fShader = this.createShader(gl.FRAGMENT_SHADER, fSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error("Failed to create program");
    gl.attachShader(prog, vShader);
    gl.attachShader(prog, fShader);
    gl.bindAttribLocation(prog, 0, "a_position");
    gl.bindAttribLocation(prog, 1, "a_texCoord");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(prog);
      throw new Error("Program link error: " + err);
    }
    gl.deleteShader(vShader);
    gl.deleteShader(fShader);
    return prog;
  }

  private createBuffer(data: Float32Array): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer();
    if (!buf) throw new Error("Failed to create buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private createFramebuffer(w: number, h: number): FBO {
    const gl = this.gl;
    const tex = this.createTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("Failed to create framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { framebuffer: fbo, texture: tex, width: w, height: h };
  }

  private deleteFramebuffer(fbo: FBO) {
    this.gl.deleteFramebuffer(fbo.framebuffer);
    this.gl.deleteTexture(fbo.texture);
  }

  public dispose() {
    this.stop();
    const gl = this.gl;
    gl.deleteProgram(this.blurProgram);
    gl.deleteProgram(this.blendProgram);
    gl.deleteProgram(this.tintProgram);
    gl.deleteProgram(this.warpProgram);
    gl.deleteProgram(this.outputProgram);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteTexture(this.sourceTexture);
    this.deleteFramebuffer(this.blurFBO1);
    this.deleteFramebuffer(this.blurFBO2);
    this.deleteFramebuffer(this.currentAlbumFBO);
    this.deleteFramebuffer(this.nextAlbumFBO);
    this.deleteFramebuffer(this.transitionFBO);
    this.deleteFramebuffer(this.warpFBO);
  }
}

export interface KawarpBackgroundProps {
  coverUrl?: string | null;
  className?: string;
}

export function KawarpBackground({ coverUrl, className = "" }: KawarpBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<KawarpEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: KawarpEngine | null = null;
    try {
      engine = new KawarpEngine(canvas);
      engineRef.current = engine;
      engine.start();
    } catch (e) {
      console.warn("KawarpEngine WebGL init failed:", e);
      return;
    }

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        engine?.resize();
      }
    };

    updateSize();

    const ro = new ResizeObserver(() => updateSize());
    ro.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) {
        engine?.stop();
      } else {
        engine?.start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (coverUrl && engineRef.current) {
      void engineRef.current.loadImage(coverUrl);
    }
  }, [coverUrl]);

  return (
    <canvas
      ref={canvasRef}
      className={`kawarp-canvas ${className}`}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
