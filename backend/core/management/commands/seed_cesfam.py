from django.core.management.base import BaseCommand
from seed_cesfam import ejecutar_semilla_cesfam


class Command(BaseCommand):
    help = "Puebla la base de datos de Farmacia Asistencial CESFAM con datos reales de prueba."

    def handle(self, *args, **options):
        resultado = ejecutar_semilla_cesfam()
        self.stdout.write(self.style.SUCCESS("Semilla CESFAM ejecutada correctamente:"))
        for clave, valor in resultado.items():
            self.stdout.write(f"  * {clave}: {valor}")
