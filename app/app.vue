<template>
  <div class="app-root">
    <NuxtRouteAnnouncer />
    <svg
      class="surface-svg-filters"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          id="surface-droplet"
          x="-45%"
          y="-45%"
          width="190%"
          height="190%"
          color-interpolation-filters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.0068"
            numOctaves="3"
            seed="21"
            stitchTiles="stitch"
            result="raw"
          />
          <feGaussianBlur in="raw" stdDeviation="2.6" result="map" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="52"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  min-height: 100vh;
}
</style>
