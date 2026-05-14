<template>
   <div class="forest-canvas-host" aria-hidden="true">
      <ClientOnly>
         <ForestImmersion :show-forest-image="true" />
      </ClientOnly>
      <div class="forest-shade forest-shade--dark" />
   </div>
</template>
