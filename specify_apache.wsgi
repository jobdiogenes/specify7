# -*- python -*-
import os
import sys

sys.path.append(os.path.dirname(__file__))
sys.path.append(os.path.join(os.path.dirname(__file__), 'specify7'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'specify7.settings'

import django.core.handlers.wsgi
application = django.core.handlers.wsgi.WSGIHandler()
